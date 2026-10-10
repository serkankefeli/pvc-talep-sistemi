import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CommerceConfig,
  CommerceService,
  DocumentKey,
  PurchaseIntent,
} from '../../core/commerce.service';
import { finalize } from 'rxjs';
import { PermissionFieldsetDirective } from '../../core/permission-fieldset.directive';

@Component({
  imports: [FormsModule, PermissionFieldsetDirective],
  templateUrl: './admin-commerce.component.html',
  styleUrl: './commerce.scss',
})
export class AdminCommerceComponent {
  private readonly api = inject(CommerceService);
  readonly config = signal<CommerceConfig | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly purchases = signal<PurchaseIntent[]>([]);
  readonly purchasesMessage = signal('');
  readonly keys: DocumentKey[] = ['privacy', 'refund', 'distance_sales'];
  constructor() {
    this.reload();
  }
  reload(): void {
    this.api.purchases().subscribe({
      next: (rows) => {
        this.purchases.set(rows);
        this.purchasesMessage.set('');
      },
      error: () => this.purchasesMessage.set('Abonelik başvuruları yüklenemedi.'),
    });
    this.api.configuration().subscribe({
      next: (value) => this.config.set(value),
      error: () => this.message.set('Ayarlar yüklenemedi. Sistem yöneticisi yetkisi gereklidir.'),
    });
  }
  save(): void {
    const config = this.config();
    if (!config || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.api
      .save({
        ...config,
        support_email: config.support_email?.trim() || null,
        total_amount: config.total_amount || null,
      })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (value) => {
          this.config.set(value);
          this.message.set('Ayarlar kaydedildi.');
        },
        error: (error: HttpErrorResponse) =>
          this.message.set(
            typeof error.error?.detail === 'string'
              ? error.error.detail
              : 'Kaydedilemedi. Alanları ve resmî iyzico Link adresini kontrol edin.',
          ),
      });
  }
}
