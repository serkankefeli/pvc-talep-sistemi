import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminUser, AdminUserCreate, AdminUserUpdate } from './request.models';
import { RUNTIME_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private readonly baseUrl = `${this.config.apiUrl}/api/v1/admin/users`;

  current(): Observable<AdminUser> {
    return this.http.get<AdminUser>(`${this.baseUrl}/me`);
  }

  list(): Observable<readonly AdminUser[]> {
    return this.http.get<readonly AdminUser[]>(this.baseUrl);
  }

  create(payload: AdminUserCreate): Observable<AdminUser> {
    return this.http.post<AdminUser>(this.baseUrl, payload);
  }

  update(id: number, payload: AdminUserUpdate): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.baseUrl}/${id}`, payload);
  }

  resetPassword(id: number, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/password`, {
      new_password: newPassword,
    });
  }

  changeOwnPassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/me/password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }
}
