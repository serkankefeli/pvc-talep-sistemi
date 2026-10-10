import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { CompanyService } from './company.service';

export const subscriptionGuard: CanActivateChildFn = (_route, state) => {
  if (
    [
      '/admin/firma',
      '/admin/odeme',
      '/admin/kullanicilar',
      '/admin/yetkisiz',
      '/admin/abonelik-bitti',
    ].includes(state.url.split('?')[0])
  )
    return true;
  const router = inject(Router);
  return inject(CompanyService)
    .accessStatus()
    .pipe(
      map((company) =>
        company.access_mode === 'expired' ? router.createUrlTree(['/admin/abonelik-bitti']) : true,
      ),
      catchError(() => of(router.createUrlTree(['/admin/abonelik-bitti']))),
    );
};
