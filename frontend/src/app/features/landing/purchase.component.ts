import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommerceService, PublicOffer } from '../../core/commerce.service';

@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './purchase.component.html',
  styleUrl: '../admin/commerce.scss',
})
export class PurchaseComponent {
  private readonly api = inject(CommerceService);
  private readonly destroyRef = inject(DestroyRef);
  readonly offer = signal<PublicOffer | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly link = signal<{ url: string; reference: string } | null>(null);
  fullName = '';
  companyName = '';
  email = '';
  usageMode: '' | 'integrated' | 'standalone' = '';
  refund = false;
  contract = false;
  private idempotencyKey = crypto.randomUUID();

  constructor() {
    this.load();
  }
  load(): void {
    this.offer.set(null);
    this.message.set('');
    this.refund = false;
    this.contract = false;
    this.link.set(null);
    this.idempotencyKey = crypto.randomUUID();
    this.api
      .publicOffer()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offer) => this.offer.set(offer),
        error: () => {
          this.offer.set(null);
          this.message.set('Abonelik bilgileri yüklenemedi. Yeniden deneyin.');
        },
      });
  }
  invalidate(): void {
    if (this.link()) this.idempotencyKey = crypto.randomUUID();
    this.link.set(null);
  }
  prepare(): void {
    const offer = this.offer();
    const mode = this.usageMode;
    if (
      !offer?.available ||
      !offer.payment_enabled ||
      !this.refund ||
      !this.contract ||
      this.busy() ||
      this.link() ||
      this.fullName.trim().length < 2 ||
      this.companyName.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim()) ||
      (mode !== 'integrated' && mode !== 'standalone')
    )
      return;
    this.busy.set(true);
    this.message.set('');
    this.api
      .purchase(offer.revision, this.idempotencyKey, {
        full_name: this.fullName.trim(),
        company_name: this.companyName.trim(),
        email: this.email.trim(),
        usage_mode: mode,
      })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (result) => this.link.set(result),
        error: (error: HttpErrorResponse) => {
          if (error.status === 409) this.load();
          this.message.set(
            typeof error.error?.detail === 'string'
              ? error.error.detail
              : 'Başvuru oluşturulamadı. Bilgileri kontrol edin veya bir süre sonra yeniden deneyin.',
          );
        },
      });
  }
}
