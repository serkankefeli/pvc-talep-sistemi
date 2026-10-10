import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Billing, CommerceService } from '../../core/commerce.service';
import { finalize } from 'rxjs';
import { PermissionFieldsetDirective } from '../../core/permission-fieldset.directive';

@Component({
  imports: [FormsModule, RouterLink, PermissionFieldsetDirective],
  styleUrl: './commerce.scss',
  template: `
    <h1>Yıllık abonelik ödemesi</h1>
    <img class="payment-logo" src="/payments/iyzico-pay.svg" alt="iyzico ile Öde" />
    @if (billing(); as offer) {
      @if (offer.payment_enabled) {
        <h2>{{ offer.seller_name }}</h2>
        <p>{{ offer.seller_address }}</p>
        <p>{{ offer.support_email }} · {{ offer.support_phone }}</p>
        <p class="legal-body">{{ offer.service_description }}</p>
        <p>Bir takvim yılı · Vergiler dahil toplam {{ offer.total_amount }} TL</p>
        <p>
          Otomatik tahsilat yapılmaz. Ödeme iyzico sayfasında alınır. Abonelik ödeme doğrulamasından
          sonra yenilenir.
        </p>
        <p><a routerLink="/gizlilik-politikasi" target="_blank">Gizlilik / KVKK aydınlatması</a></p>
        <fieldset appPermission="billing.use">
          <label class="check"
            ><input type="checkbox" [(ngModel)]="refund" (ngModelChange)="link.set(null)" />
            <span
              ><a routerLink="/iptal-iade" target="_blank">İptal ve iade koşullarını</a>
              okudum.</span
            ></label
          >
          <label class="check"
            ><input type="checkbox" [(ngModel)]="contract" (ngModelChange)="link.set(null)" />
            <span
              ><a routerLink="/mesafeli-satis" target="_blank">Mesafeli satış sözleşmesini</a>
              okudum ve kabul ediyorum.</span
            ></label
          >
          <button
            type="button"
            [disabled]="!refund || !contract || busy()"
            (click)="prepare(offer.revision)"
          >
            Ödeme bağlantısını hazırla
          </button>
        </fieldset>
        @if (link(); as payment) {
          <p>
            <a class="payment-action" [href]="payment.url" target="_blank" rel="noopener noreferrer"
              >iyzico güvenli ödeme sayfasına git →</a
            >
          </p>
          <p>İşlem referansı: {{ payment.reference }}. Bu kayıt ödeme dekontu değildir.</p>
        }
      } @else {
        <p>Ödeme henüz aktif değil. Yenileme için hizmet yöneticisiyle iletişime geçin.</p>
      }
    }
    @if (message()) {
      <p role="alert">{{ message() }}</p>
    }
    <p><a routerLink="/admin/firma">← Firma ve abonelik</a></p>
  `,
})
export class CheckoutComponent {
  private readonly api = inject(CommerceService);
  readonly billing = signal<Billing | null>(null);
  readonly link = signal<{ url: string; reference: string } | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  refund = false;
  contract = false;
  constructor() {
    this.load();
  }
  load(): void {
    this.refund = false;
    this.contract = false;
    this.link.set(null);
    this.api.billing().subscribe({
      next: (data) => this.billing.set(data),
      error: () =>
        this.message.set(
          'Ödeme bilgileri yüklenemedi. Yeniden giriş yapın veya hizmet yöneticisine ulaşın.',
        ),
    });
  }
  prepare(revision: number): void {
    if (!this.refund || !this.contract || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.link.set(null);
    this.api
      .checkout(revision)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (result) => this.link.set(result),
        error: () => {
          this.load();
          this.message.set(
            'Bağlantı oluşturulamadı veya koşullar değişti. Güncel metinleri tekrar okuyup onaylayın.',
          );
        },
      });
  }
}
