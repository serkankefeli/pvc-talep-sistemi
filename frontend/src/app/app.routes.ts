import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: '',
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
    loadComponent: () =>
      import('./features/admin/admin-shell.component').then((module) => module.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'talepler' },
      {
        path: 'talepler',
        title: 'Talep Merkezi',
        loadComponent: () =>
          import('./features/admin/admin-request-list.component').then(
            (module) => module.AdminRequestListComponent,
          ),
      },
      {
        path: 'talepler/:id',
        title: 'Talep Detayı',
        loadComponent: () =>
          import('./features/admin/admin-request-detail.component').then(
            (module) => module.AdminRequestDetailComponent,
          ),
      },
      {
        path: 'katalog',
        title: 'Form Kataloğu',
        loadComponent: () =>
          import('./features/admin/admin-catalog.component').then(
            (module) => module.AdminCatalogComponent,
          ),
      },
      {
        path: 'marka',
        title: 'Logo ve Site Kimliği',
        loadComponent: () =>
          import('./features/admin/admin-branding.component').then(
            (module) => module.AdminBrandingComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
