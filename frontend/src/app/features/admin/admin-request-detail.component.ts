import { DOCUMENT, DatePipe, KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AdminRequestDetail,
  AdminRequestRevision,
  BalconyEnclosureItem,
  BalconySegment,
  productTypeLabel,
  PublicRequestItem,
  RequestStatus,
  STATUS_LABELS,
} from '../../core/request.models';
import { RequestApiService } from '../../core/request-api.service';
import { ProductPreviewComponent } from '../../shared/product-preview.component';

@Component({
  selector: 'app-admin-request-detail',
  imports: [DatePipe, KeyValuePipe, ProductPreviewComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-request-detail.component.html',
  styleUrl: './admin-request-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRequestDetailComponent {
  private readonly api = inject(RequestApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  private readonly requestId = Number(this.route.snapshot.paramMap.get('id'));

  readonly statusLabels = STATUS_LABELS;
  readonly productLabel = productTypeLabel;
  readonly loading = signal(true);
  readonly detail = signal<AdminRequestDetail | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveMessage = signal<string | null>(null);
  readonly sending = signal(false);
  readonly emailMessage = signal<string | null>(null);
  readonly favoriteSaving = signal(false);
  readonly favoriteMessage = signal<string | null>(null);
  readonly revisions = signal<readonly AdminRequestRevision[]>([]);
  readonly revisionSaving = signal(false);
  readonly revisionMessage = signal<string | null>(null);

  readonly updateForm = this.fb.group({
    status: this.fb.nonNullable.control<RequestStatus>('new'),
    internalNotes: this.fb.nonNullable.control('', Validators.maxLength(10_000)),
    quotedAmount: this.fb.control<number | null>(null, Validators.min(0)),
  });

  readonly emailForm = this.fb.group({
    subject: this.fb.nonNullable.control('Talebiniz hakkında', [
      Validators.required,
      Validators.maxLength(200),
    ]),
    message: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(10_000)]),
    includeQuote: this.fb.nonNullable.control(false),
    confirmed: this.fb.nonNullable.control(false, Validators.requiredTrue),
  });

  readonly revisionForm = this.fb.group({
    note: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(3000)]),
  });

  catalogAnswerLabel(key: string): string {
    return key.replaceAll('_', ' ');
  }

  catalogAnswerValue(value: string | boolean | number): string {
    if (typeof value === 'boolean') {
      return value ? 'Evet' : 'Hayır';
    }
    return typeof value === 'number'
      ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value)
      : value;
  }

  balconySegments(item: PublicRequestItem): readonly BalconySegment[] {
    if (item.product_type !== 'balcony_enclosure') {
      return [];
    }
    const segments = (item as BalconyEnclosureItem).segments;
    return Array.isArray(segments) ? segments : [];
  }

  balconyTotalWidth(item: PublicRequestItem): number {
    return this.balconySegments(item).reduce((total, segment) => total + segment.width_mm, 0);
  }

  adminNotificationLabel(state: string): string {
    switch (state) {
      case 'sent':
        return 'Gönderildi';
      case 'sending':
        return 'Gönderiliyor';
      case 'failed':
        return 'Gönderilemedi';
      case 'skipped':
        return 'E-posta bildirimi kapalı';
      default:
        return 'Gönderim bekliyor';
    }
  }

  constructor() {
    this.load();
  }

  load(): void {
    if (!Number.isInteger(this.requestId) || this.requestId < 1) {
      this.loadError.set('Geçersiz talep numarası.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getRequest(this.requestId).subscribe({
      next: (detail) => {
        this.applyDetail(detail);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Talep bilgileri yüklenemedi.');
        this.loading.set(false);
      },
    });
    this.loadRevisions();
  }

  printPreProject(): void {
    this.document.defaultView?.print();
  }

  createRevision(): void {
    this.revisionForm.markAllAsTouched();
    if (this.revisionForm.invalid || this.revisionSaving()) {
      return;
    }
    this.revisionSaving.set(true);
    this.revisionMessage.set(null);
    this.api.createRevision(this.requestId, this.revisionForm.controls.note.value.trim()).subscribe({
      next: (revision) => {
        this.revisions.update((revisions) => [revision, ...revisions]);
        this.revisionForm.reset();
        this.revisionMessage.set(`Revizyon ${revision.revision_number} oluşturuldu.`);
        this.revisionSaving.set(false);
      },
      error: () => {
        this.revisionMessage.set('Revizyon oluşturulamadı.');
        this.revisionSaving.set(false);
      },
    });
  }

  toggleFavorite(): void {
    const current = this.detail();
    if (!current || this.favoriteSaving()) {
      return;
    }

    const favorite = !current.favorite;
    this.favoriteSaving.set(true);
    this.favoriteMessage.set(null);
    this.api.setFavorite(this.requestId, favorite).subscribe({
      next: () => {
        this.detail.update((detail) => (detail ? { ...detail, favorite } : detail));
        this.favoriteMessage.set(
          favorite ? 'Talep favorilere eklendi.' : 'Talep favorilerden çıkarıldı.',
        );
        this.favoriteSaving.set(false);
      },
      error: () => {
        this.favoriteMessage.set('Favori durumu değiştirilemedi. Lütfen yeniden deneyin.');
        this.favoriteSaving.set(false);
      },
    });
  }

  save(): void {
    this.updateForm.markAllAsTouched();
    if (this.updateForm.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveMessage.set(null);
    const value = this.updateForm.getRawValue();
    this.api
      .updateRequest(this.requestId, {
        status: value.status,
        internal_notes: value.internalNotes.trim() || null,
        quoted_amount: value.quotedAmount,
      })
      .subscribe({
        next: (detail) => {
          this.applyDetail(detail);
          this.saveMessage.set('Değişiklikler kaydedildi.');
          this.saving.set(false);
        },
        error: () => {
          this.saveMessage.set('Değişiklikler kaydedilemedi.');
          this.saving.set(false);
        },
      });
  }

  sendEmail(): void {
    this.emailForm.markAllAsTouched();
    if (this.emailForm.invalid || this.sending() || !this.detail()?.contact.email) {
      return;
    }
    this.sending.set(true);
    this.emailMessage.set(null);
    const value = this.emailForm.getRawValue();
    this.api
      .sendCustomerEmail(this.requestId, {
        subject: value.subject.trim(),
        message: value.message.trim(),
        include_quote: value.includeQuote,
      })
      .subscribe({
        next: (result) => {
          this.emailMessage.set(
            `E-posta gönderildi (${new Date(result.sent_at).toLocaleString('tr-TR')}).`,
          );
          this.emailForm.controls.confirmed.setValue(false);
          this.sending.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.emailMessage.set(
            error instanceof HttpErrorResponse && error.status === 409
              ? 'Bu talepte gönderime uygun bir e-posta adresi yok.'
              : 'E-posta gönderilemedi. Sunucu ayarlarını kontrol edin.',
          );
          this.sending.set(false);
        },
      });
  }

  private applyDetail(detail: AdminRequestDetail): void {
    this.detail.set(detail);
    this.updateForm.setValue({
      status: detail.status,
      internalNotes: detail.internal_notes ?? '',
      quotedAmount: detail.quoted_amount === null ? null : Number(detail.quoted_amount),
    });
  }

  private loadRevisions(): void {
    this.api.listRevisions(this.requestId).subscribe({
      next: (revisions) => this.revisions.set(revisions),
      error: () => this.revisions.set([]),
    });
  }
}
