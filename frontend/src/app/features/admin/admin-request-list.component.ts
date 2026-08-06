import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import {
  AdminRequestDetail,
  AdminRequestSummary,
  productTypeLabel,
  RequestStatus,
  STATUS_LABELS,
} from '../../core/request.models';
import { RequestApiService } from '../../core/request-api.service';
import { ProductPreviewComponent } from '../../shared/product-preview.component';

type RequestScope = 'all' | 'favorites';
type ViewMode = 'table' | 'cards';
type RequestColumn = 'customer' | 'product' | 'status' | 'amount' | 'created';
type SortValue =
  | 'created_at:desc'
  | 'created_at:asc'
  | 'updated_at:desc'
  | 'customer_name:asc'
  | 'status:asc';

interface RecentRequest {
  readonly id: number;
  readonly requestNumber: string;
}

const PAGE_SIZE = 20;
const MAX_RECENT_REQUESTS = 8;
const VIEW_STORAGE_KEY = 'pvc-admin-request-view';
const COLUMN_STORAGE_KEY = 'pvc-admin-request-columns';
const RECENT_STORAGE_KEY = 'pvc-admin-recent-requests';
const DEFAULT_COLUMNS: readonly RequestColumn[] = ['customer', 'product', 'status', 'created'];
const COLUMN_OPTIONS: readonly { readonly key: RequestColumn; readonly label: string }[] = [
  { key: 'customer', label: 'Müşteri' },
  { key: 'product', label: 'Ürün sayısı' },
  { key: 'status', label: 'Durum' },
  { key: 'amount', label: 'Teklif tutarı' },
  { key: 'created', label: 'Oluşturulma' },
];
const STATUS_STEPS: readonly { readonly key: RequestStatus; readonly label: string }[] = [
  { key: 'new', label: 'Yeni' },
  { key: 'reviewing', label: 'İnceleme' },
  { key: 'contacted', label: 'İletişim' },
  { key: 'quoted', label: 'Teklif' },
  { key: 'won', label: 'Onay' },
];

@Component({
  selector: 'app-admin-request-list',
  imports: [DatePipe, DecimalPipe, ProductPreviewComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-request-list.component.html',
  styleUrl: './admin-request-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRequestListComponent {
  private readonly api = inject(RequestApiService);
  private readonly reloadRequests = new Subject<void>();
  private readonly loadDetail = new Subject<number>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly requests = signal<readonly AdminRequestSummary[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);
  readonly scope = signal<RequestScope>('all');
  readonly selectedId = signal<number | null>(null);
  readonly selectedDetail = signal<AdminRequestDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);
  readonly selectedItemIndex = signal(0);
  readonly favoriteSavingIds = signal<ReadonlySet<number>>(new Set<number>());
  readonly actionMessage = signal<string | null>(null);
  readonly viewMode = signal<ViewMode>(this.readViewMode());
  readonly visibleColumns = signal<ReadonlySet<RequestColumn>>(this.readColumns());
  readonly recentRequests = signal<readonly RecentRequest[]>(this.readRecentRequests());

  readonly statusLabels = STATUS_LABELS;
  readonly statusEntries = Object.entries(STATUS_LABELS) as readonly (readonly [
    RequestStatus,
    string,
  ])[];
  readonly columnOptions = COLUMN_OPTIONS;
  readonly statusSteps = STATUS_STEPS;
  readonly pageSize = PAGE_SIZE;
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly pageStart = computed(() =>
    this.total() === 0 ? 0 : (this.currentPage() - 1) * PAGE_SIZE + 1,
  );
  readonly pageEnd = computed(() =>
    Math.min(this.currentPage() * PAGE_SIZE, this.total()),
  );
  readonly selectedItem = computed(() => {
    const detail = this.selectedDetail();
    return detail?.items[this.selectedItemIndex()] ?? null;
  });

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<RequestStatus | ''>('', { nonNullable: true });
  readonly sortControl = new FormControl<SortValue>('created_at:desc', { nonNullable: true });

  constructor() {
    this.reloadRequests
      .pipe(
        startWith(undefined),
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(() =>
          this.api.listRequests(this.requestQuery()).pipe(
            map((result) => ({ result, error: null as string | null })),
            catchError(() =>
              of({
                result: null,
                error: 'Talepler yüklenemedi. Lütfen yeniden deneyin.',
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ result, error }) => {
        this.loading.set(false);
        if (!result) {
          this.error.set(error);
          return;
        }

        const lastAvailablePage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (this.currentPage() > lastAvailablePage) {
          this.currentPage.set(lastAvailablePage);
          this.reloadRequests.next();
          return;
        }

        this.requests.set(result.items);
        this.total.set(result.total);
        if (result.items.length === 0) {
          this.clearSelection();
          return;
        }

        const selectedStillVisible = result.items.some((item) => item.id === this.selectedId());
        if (!selectedStillVisible) {
          this.selectRequest(result.items[0], false);
        }
      });

    this.loadDetail
      .pipe(
        tap(() => {
          this.detailLoading.set(true);
          this.detailError.set(null);
        }),
        switchMap((id) =>
          this.api.getRequest(id).pipe(
            map((detail) => ({ detail, error: null as string | null })),
            catchError(() =>
              of({ detail: null, error: 'Hızlı önizleme yüklenemedi.' }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ detail, error }) => {
        this.detailLoading.set(false);
        this.selectedDetail.set(detail);
        this.detailError.set(error);
        this.selectedItemIndex.set(0);
      });

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.resetPageAndLoad());
    this.statusFilter.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.resetPageAndLoad());
    this.sortControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.resetPageAndLoad());

    // Synchronous test/local transports can return the first page before the
    // detail stream is subscribed. In that case, request the initial preview now.
    const initialSelectedId = this.selectedId();
    if (initialSelectedId !== null && this.selectedDetail() === null) {
      this.loadDetail.next(initialSelectedId);
    }
  }

  load(): void {
    this.reloadRequests.next();
  }

  setScope(scope: RequestScope): void {
    if (this.scope() === scope) {
      return;
    }
    this.scope.set(scope);
    this.resetPageAndLoad();
  }

  clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.statusFilter.setValue('', { emitEvent: false });
    this.sortControl.setValue('created_at:desc', { emitEvent: false });
    this.currentPage.set(1);
    this.load();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.writeStorage(VIEW_STORAGE_KEY, mode);
  }

  isColumnVisible(column: RequestColumn): boolean {
    return this.visibleColumns().has(column);
  }

  toggleColumn(column: RequestColumn, visible: boolean): void {
    const next = new Set(this.visibleColumns());
    if (visible) {
      next.add(column);
    } else {
      next.delete(column);
    }
    this.visibleColumns.set(next);
    this.writeStorage(COLUMN_STORAGE_KEY, [...next]);
  }

  selectRequest(request: AdminRequestSummary, remember = true): void {
    this.selectedId.set(request.id);
    this.loadDetail.next(request.id);
    if (remember) {
      this.rememberRequest(request.id, request.request_number);
    }
  }

  selectRecent(request: RecentRequest): void {
    this.selectedId.set(request.id);
    this.loadDetail.next(request.id);
    this.rememberRequest(request.id, request.requestNumber);
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id !== null) {
      this.loadDetail.next(id);
    }
  }

  selectItem(index: number): void {
    this.selectedItemIndex.set(index);
  }

  rememberFromLink(request: AdminRequestSummary): void {
    this.rememberRequest(request.id, request.request_number);
  }

  toggleFavorite(
    request: Pick<AdminRequestSummary, 'id' | 'favorite'>,
    event?: Event,
  ): void {
    event?.stopPropagation();
    if (this.isFavoriteSaving(request.id)) {
      return;
    }

    const favorite = !request.favorite;
    this.actionMessage.set(null);
    this.favoriteSavingIds.update((ids) => new Set(ids).add(request.id));
    this.api.setFavorite(request.id, favorite).subscribe({
      next: () => {
        this.favoriteSavingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(request.id);
          return next;
        });
        this.requests.update((items) =>
          items.map((item) => (item.id === request.id ? { ...item, favorite } : item)),
        );
        this.selectedDetail.update((detail) =>
          detail?.id === request.id ? { ...detail, favorite } : detail,
        );
        this.actionMessage.set(favorite ? 'Talep favorilere eklendi.' : 'Talep favorilerden çıkarıldı.');
        if (this.scope() === 'favorites' && !favorite) {
          this.load();
        }
      },
      error: () => {
        this.favoriteSavingIds.update((ids) => {
          const next = new Set(ids);
          next.delete(request.id);
          return next;
        });
        this.actionMessage.set('Favori bilgisi güncellenemedi.');
      },
    });
  }

  isFavoriteSaving(id: number): boolean {
    return this.favoriteSavingIds().has(id);
  }

  previousPage(): void {
    if (this.currentPage() <= 1) {
      return;
    }
    this.currentPage.update((page) => page - 1);
    this.load();
  }

  nextPage(): void {
    if (this.currentPage() >= this.pageCount()) {
      return;
    }
    this.currentPage.update((page) => page + 1);
    this.load();
  }

  productLabel(productType: string): string {
    return productTypeLabel(productType);
  }

  statusStepState(status: RequestStatus, step: RequestStatus): 'complete' | 'current' | 'pending' {
    const statusIndex = STATUS_STEPS.findIndex((entry) => entry.key === status);
    const stepIndex = STATUS_STEPS.findIndex((entry) => entry.key === step);
    if (statusIndex < 0) {
      return 'pending';
    }
    if (statusIndex === stepIndex) {
      return 'current';
    }
    return stepIndex < statusIndex ? 'complete' : 'pending';
  }

  private resetPageAndLoad(): void {
    this.currentPage.set(1);
    this.load();
  }

  private clearSelection(): void {
    this.selectedId.set(null);
    this.selectedDetail.set(null);
    this.detailError.set(null);
    this.selectedItemIndex.set(0);
  }

  private requestQuery(): {
    readonly status?: RequestStatus;
    readonly search?: string;
    readonly favorite?: boolean;
    readonly sort_by: 'created_at' | 'updated_at' | 'customer_name' | 'status';
    readonly sort_dir: 'asc' | 'desc';
    readonly limit: number;
    readonly offset: number;
  } {
    const [sortBy, sortDir] = this.sortControl.value.split(':') as [
      'created_at' | 'updated_at' | 'customer_name' | 'status',
      'asc' | 'desc',
    ];
    const search = this.searchControl.value.trim();
    const status = this.statusFilter.value || undefined;
    return {
      ...(status ? { status } : {}),
      ...(search.length >= 2 ? { search } : {}),
      ...(this.scope() === 'favorites' ? { favorite: true } : {}),
      sort_by: sortBy,
      sort_dir: sortDir,
      limit: PAGE_SIZE,
      offset: (this.currentPage() - 1) * PAGE_SIZE,
    };
  }

  private rememberRequest(id: number, requestNumber: string): void {
    const next = [
      { id, requestNumber },
      ...this.recentRequests().filter((request) => request.id !== id),
    ].slice(0, MAX_RECENT_REQUESTS);
    this.recentRequests.set(next);
    this.writeStorage(RECENT_STORAGE_KEY, next);
  }

  private readViewMode(): ViewMode {
    const value = this.readStorage(VIEW_STORAGE_KEY);
    return value === 'cards' ? 'cards' : 'table';
  }

  private readColumns(): ReadonlySet<RequestColumn> {
    const value = this.readStorage(COLUMN_STORAGE_KEY);
    if (!Array.isArray(value)) {
      return new Set(DEFAULT_COLUMNS);
    }
    const allowed = new Set(COLUMN_OPTIONS.map((column) => column.key));
    const columns = value.filter(
      (entry): entry is RequestColumn => typeof entry === 'string' && allowed.has(entry as RequestColumn),
    );
    return new Set(columns.length ? columns : DEFAULT_COLUMNS);
  }

  private readRecentRequests(): readonly RecentRequest[] {
    const value = this.readStorage(RECENT_STORAGE_KEY);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (entry): entry is RecentRequest =>
          typeof entry === 'object' &&
          entry !== null &&
          Number.isInteger((entry as RecentRequest).id) &&
          typeof (entry as RecentRequest).requestNumber === 'string',
      )
      .slice(0, MAX_RECENT_REQUESTS);
  }

  private readStorage(key: string): unknown {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Preferences remain usable for this session when browser storage is unavailable.
    }
  }
}
