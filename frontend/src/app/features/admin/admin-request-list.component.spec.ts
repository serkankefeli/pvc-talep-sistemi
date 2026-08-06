import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminRequestDetail,
  AdminRequestList,
  AdminRequestSummary,
  WindowItem,
} from '../../core/request.models';
import { AdminRequestListQuery, RequestApiService } from '../../core/request-api.service';
import { AdminRequestListComponent } from './admin-request-list.component';

describe('AdminRequestListComponent', () => {
  const windowItem: WindowItem = {
    product_type: 'pvc_window',
    width_mm: 1200,
    height_mm: 1400,
    quantity: 1,
    color: 'Beyaz',
    profile_series: 'Prestij 76',
    notes: null,
    drawing_version: '2',
    catalog_answers: {},
    layout: 'single_sash',
    opening_direction: 'left',
    glazing: 'Isıcam',
    divisions: [],
  };

  const summary: AdminRequestSummary = {
    id: 1,
    request_number: 'TLP-2026-0001',
    status: 'reviewing',
    favorite: false,
    customer_name: 'Ayşe Yılmaz',
    company_name: 'Yılmaz Yapı',
    customer_email: 'ayse@example.test',
    customer_phone: '05000000000',
    preferred_contact: 'phone',
    product_count: 1,
    quoted_amount: '24800.00',
    quote_currency: 'TRY',
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T11:00:00Z',
  };

  const detail: AdminRequestDetail = {
    id: summary.id,
    request_number: summary.request_number,
    status: summary.status,
    favorite: summary.favorite,
    contact: {
      full_name: summary.customer_name,
      company_name: summary.company_name,
      email: summary.customer_email,
      phone: summary.customer_phone,
      preferred_contact: summary.preferred_contact,
      city: 'İstanbul',
      district: 'Kadıköy',
    },
    project_note: null,
    privacy_consent: true,
    items: [windowItem],
    internal_notes: null,
    quoted_amount: summary.quoted_amount,
    quote_currency: 'TRY',
    admin_notification_state: 'sent',
    admin_notified_at: '2026-08-01T10:01:00Z',
    customer_email_sent_at: null,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
  };

  const response = (items: readonly AdminRequestSummary[], total = items.length): AdminRequestList => ({
    items,
    total,
    limit: 20,
    offset: 0,
  });

  const api = {
    listRequests: vi.fn((_query: AdminRequestListQuery = {}) => of(response([summary]))),
    getRequest: vi.fn((id: number) =>
      of({ ...detail, id, request_number: id === 1 ? detail.request_number : `TLP-${id}` }),
    ),
    setFavorite: vi.fn(() => of(void 0)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    api.listRequests.mockImplementation((_query: AdminRequestListQuery = {}) =>
      of(response([summary])),
    );
    api.getRequest.mockImplementation((id: number) =>
      of({ ...detail, id, request_number: id === 1 ? detail.request_number : `TLP-${id}` }),
    );
    api.setFavorite.mockImplementation(() => of(void 0));

    await TestBed.configureTestingModule({
      imports: [AdminRequestListComponent],
      providers: [provideRouter([]), { provide: RequestApiService, useValue: api }],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('loads a real first page, selects the first request, and keeps the price column hidden', () => {
    const fixture = TestBed.createComponent(AdminRequestListComponent);
    fixture.detectChanges();

    expect(api.listRequests).toHaveBeenCalledWith({
      sort_by: 'created_at',
      sort_dir: 'desc',
      limit: 20,
      offset: 0,
    });
    expect(api.getRequest).toHaveBeenCalledWith(1);
    expect(fixture.componentInstance.selectedId()).toBe(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('.drawing-card app-product-preview')).toBeTruthy();
    const headers = [...(fixture.nativeElement as HTMLElement).querySelectorAll('th')].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(headers).not.toContain('Tutar');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('24.800');
  });

  it('debounces search and ignores a stale response after a newer query', async () => {
    vi.useFakeTimers();
    const firstSearch = new Subject<AdminRequestList>();
    const secondSearch = new Subject<AdminRequestList>();
    const oldResult = { ...summary, id: 2, request_number: 'TLP-ESKI' };
    const newestResult = { ...summary, id: 3, request_number: 'TLP-YENI' };
    api.listRequests.mockImplementation((query: AdminRequestListQuery = {}) => {
      if (query.search === 'ilk arama') {
        return firstSearch;
      }
      if (query.search === 'son arama') {
        return secondSearch;
      }
      return of(response([summary]));
    });
    const fixture = TestBed.createComponent(AdminRequestListComponent);
    const component = fixture.componentInstance;

    component.searchControl.setValue('ilk arama');
    await vi.advanceTimersByTimeAsync(300);
    component.searchControl.setValue('son arama');
    await vi.advanceTimersByTimeAsync(300);
    secondSearch.next(response([newestResult]));
    firstSearch.next(response([oldResult]));

    expect(api.listRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'son arama', offset: 0 }),
    );
    expect(component.requests().map((request) => request.request_number)).toEqual(['TLP-YENI']);
  });

  it('uses server pagination and resets filters to the first page', () => {
    api.listRequests.mockImplementation((_query: AdminRequestListQuery = {}) =>
      of(response([summary], 45)),
    );
    const fixture = TestBed.createComponent(AdminRequestListComponent);
    const component = fixture.componentInstance;

    expect(component.pageCount()).toBe(3);
    component.nextPage();
    expect(api.listRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 20, offset: 20 }),
    );

    component.statusFilter.setValue('quoted');
    expect(component.currentPage()).toBe(1);
    expect(api.listRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'quoted', offset: 0 }),
    );
  });

  it('loads the favorite workspace and updates the selected request without a page refresh', () => {
    const fixture = TestBed.createComponent(AdminRequestListComponent);
    const component = fixture.componentInstance;

    component.setScope('favorites');
    expect(api.listRequests).toHaveBeenLastCalledWith(expect.objectContaining({ favorite: true }));

    component.setScope('all');
    component.toggleFavorite(component.requests()[0]);
    expect(api.setFavorite).toHaveBeenCalledWith(1, true);
    expect(component.requests()[0].favorite).toBe(true);
    expect(component.selectedDetail()?.favorite).toBe(true);
  });

  it('persists view, columns, and recently viewed request preferences locally', () => {
    const firstFixture = TestBed.createComponent(AdminRequestListComponent);
    const first = firstFixture.componentInstance;
    first.setViewMode('cards');
    first.toggleColumn('amount', true);
    first.selectRequest(summary);
    firstFixture.destroy();

    const secondFixture = TestBed.createComponent(AdminRequestListComponent);
    const second = secondFixture.componentInstance;
    expect(second.viewMode()).toBe('cards');
    expect(second.isColumnVisible('amount')).toBe(true);
    expect(second.recentRequests()).toEqual([
      { id: summary.id, requestNumber: summary.request_number },
    ]);
  });
});
