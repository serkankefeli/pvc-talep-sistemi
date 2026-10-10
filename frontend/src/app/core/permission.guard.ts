import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const permissionGuard: CanActivateChildFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.token() || !auth.isAuthenticated()) {
    return router.createUrlTree(['/admin/giris'], { queryParams: { returnUrl: state.url } });
  }
  const permission = route.data['permission'] as string | undefined;
  return !permission || auth.can(permission) ? true : router.createUrlTree(['/admin/yetkisiz']);
};
