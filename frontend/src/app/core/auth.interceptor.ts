import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { RUNTIME_CONFIG } from './runtime-config';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const config = inject(RUNTIME_CONFIG);
  const token = auth.token();
  const isAdminRequest = request.url.startsWith(`${config.apiUrl}/api/v1/admin/`);
  const authenticatedRequest =
    token && isAdminRequest
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        error.error?.detail === 'SUBSCRIPTION_EXPIRED' &&
        token &&
        isAdminRequest
      ) {
        void router.navigate(['/admin/abonelik-bitti']);
      }
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        error.error?.detail === 'PERMISSION_DENIED' &&
        isAdminRequest
      ) {
        void router.navigate(['/admin/yetkisiz']);
      }
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isAdminRequest &&
        request.url !== `${config.apiUrl}/api/v1/admin/login`
      ) {
        auth.logout();
        void router.navigate(['/admin/giris']);
      }
      return throwError(() => error);
    }),
  );
};
