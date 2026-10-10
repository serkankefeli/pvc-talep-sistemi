import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [RouterLink],
  template: `@if (expired) {
      <h1>Abonelik süreniz sona erdi</h1>
      <p>
        Hesabınıza giriş yapabilirsiniz, ancak abonelik yenilenmeden iş ekranları kullanılamaz.
        Yenileme için sistem yöneticinizle iletişime geçin.
      </p>
      @if (auth.can('company.view')) {
        <p><a routerLink="/admin/firma">Firma ve abonelik bilgileri</a></p>
      }
      @if (auth.can('billing.view')) {
        <p><a routerLink="/admin/odeme">Abonelik ödeme ekranı</a></p>
      }
      <a routerLink="/admin/kullanicilar">Hesabım / parolam</a>
    } @else {
      <h1>Bu ekrana erişim yetkiniz yok</h1>
      <p>Gerekli görüntüleme veya işlem yetkisini sistem yöneticinizden isteyin.</p>
      <a [routerLink]="auth.homeUrl()">Yetkili olduğum ekrana dön</a>
    }`,
})
export class AdminForbiddenComponent {
  readonly auth = inject(AuthService);
  readonly expired = inject(ActivatedRoute).snapshot.data['expired'] === true;
}
