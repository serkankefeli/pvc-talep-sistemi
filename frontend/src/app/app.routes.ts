import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';
import { subscriptionGuard } from './core/subscription.guard';
import { permissionGuard } from './core/permission.guard';

export const routes: Routes = [
  {
    path: 'satin-al',
    title: 'Yıllık Yazılım Aboneliği',
    loadComponent: () =>
      import('./features/landing/purchase.component').then((m) => m.PurchaseComponent),
  },
  ...(['gizlilik-politikasi', 'iptal-iade', 'mesafeli-satis'] as const).map((path, index) => ({
    path,
    data: { key: ['privacy', 'refund', 'distance_sales'][index] },
    loadComponent: () => import('./features/admin/legal.component').then((m) => m.LegalComponent),
  })),
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'talep-olustur',
    title: 'Görsel Talep Oluştur',
    loadComponent: () =>
      import('./features/configurator/configurator.component').then(
        (module) => module.ConfiguratorComponent,
      ),
  },
  {
    path: 'admin/giris',
    title: 'Yönetici Girişi',
    loadComponent: () =>
      import('./features/admin/admin-login.component').then((module) => module.AdminLoginComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [permissionGuard, subscriptionGuard],
    loadComponent: () =>
      import('./features/admin/admin-shell.component').then((module) => module.AdminShellComponent),
    children: [
      {
        path: 'abonelik-bitti',
        title: 'Abonelik sona erdi',
        data: { expired: true },
        loadComponent: () =>
          import('./features/admin/admin-forbidden.component').then(
            (m) => m.AdminForbiddenComponent,
          ),
      },
      {
        path: 'yetkisiz',
        title: 'Yetkisiz erişim',
        loadComponent: () =>
          import('./features/admin/admin-forbidden.component').then(
            (m) => m.AdminForbiddenComponent,
          ),
      },
      {
        path: 'tanitim',
        data: { permission: 'landing.view' },
        title: 'Tanıtım Sayfası Yönetimi',
        loadComponent: () =>
          import('./features/admin/admin-landing.component').then((m) => m.AdminLandingComponent),
      },
      {
        path: 'sozlesmeler',
        data: { permission: 'commerce.view' },
        title: 'Sözleşmeler ve Ödeme',
        loadComponent: () =>
          import('./features/admin/admin-commerce.component').then((m) => m.AdminCommerceComponent),
      },
      {
        path: 'odeme',
        data: { permission: 'billing.view' },
        title: 'Abonelik Ödemesi',
        loadComponent: () =>
          import('./features/admin/checkout.component').then((m) => m.CheckoutComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'talepler' },
      {
        path: 'firma',
        data: { permission: 'company.view' },
        title: 'Firma ve Kullanım',
        loadComponent: () =>
          import('./features/admin/admin-company.component').then(
            (module) => module.AdminCompanyComponent,
          ),
      },
      {
        path: 'talepler',
        data: { permission: 'requests.view' },
        title: 'Talep Merkezi',
        loadComponent: () =>
          import('./features/admin/admin-request-list.component').then(
            (module) => module.AdminRequestListComponent,
          ),
      },
      {
        path: 'talepler/:id',
        data: { permission: 'requests.view' },
        title: 'Talep Detayı',
        loadComponent: () =>
          import('./features/admin/admin-request-detail.component').then(
            (module) => module.AdminRequestDetailComponent,
          ),
      },
      {
        path: 'katalog',
        data: { permission: 'catalog.view' },
        title: 'Form Kataloğu',
        loadComponent: () =>
          import('./features/admin/admin-catalog.component').then(
            (module) => module.AdminCatalogComponent,
          ),
      },
      {
        path: 'marka',
        data: { permission: 'branding.view' },
        title: 'Logo ve Site Kimliği',
        loadComponent: () =>
          import('./features/admin/admin-branding.component').then(
            (module) => module.AdminBrandingComponent,
          ),
      },
      {
        path: 'kullanicilar',
        title: 'Kullanıcı Yönetimi',
        loadComponent: () =>
          import('./features/admin/admin-users.component').then(
            (module) => module.AdminUsersComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
