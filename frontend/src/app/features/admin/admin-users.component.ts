import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminUsersService } from '../../core/admin-users.service';
import { AuthService } from '../../core/auth.service';
import { AdminUser, AdminUserUpdate } from '../../core/request.models';

@Component({
  selector: 'app-admin-users',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AdminUsersService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly me = signal<AdminUser | null>(null);
  readonly users = signal<readonly AdminUser[]>([]);
  readonly resetTarget = signal<AdminUser | null>(null);
  readonly editTarget = signal<AdminUser | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  readonly createForm = this.fb.group({
    username: this.fb.control('', [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(64),
      Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/),
    ]),
    display_name: this.fb.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(120),
    ]),
    password: this.fb.control('', [Validators.required, Validators.minLength(12)]),
    password_confirm: this.fb.control('', [Validators.required, Validators.minLength(12)]),
    is_superuser: this.fb.control(false),
  });

  readonly ownPasswordForm = this.fb.group({
    current_password: this.fb.control('', Validators.required),
    new_password: this.fb.control('', [Validators.required, Validators.minLength(12)]),
    password_confirm: this.fb.control('', [Validators.required, Validators.minLength(12)]),
  });

  readonly resetPasswordForm = this.fb.group({
    new_password: this.fb.control('', [Validators.required, Validators.minLength(12)]),
    password_confirm: this.fb.control('', [Validators.required, Validators.minLength(12)]),
  });

  readonly editUserForm = this.fb.group({
    display_name: this.fb.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(120),
    ]),
  });

  ngOnInit(): void {
    this.api.current().subscribe({
      next: (me) => {
        this.me.set(me);
        if (me.is_superuser) {
          this.loadUsers();
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Kullanıcı bilgileri yüklenemedi. Yeniden giriş yapın.');
      },
    });
  }

  loadUsers(): void {
    this.api
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (users) => this.users.set(users),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  createUser(): void {
    this.createForm.markAllAsTouched();
    const value = this.createForm.getRawValue();
    if (this.createForm.invalid || value.password !== value.password_confirm || this.busy()) {
      if (value.password !== value.password_confirm) {
        this.error.set('Yeni kullanıcı için girilen parolalar eşleşmiyor.');
      }
      return;
    }
    this.startAction();
    this.api
      .create({
        username: value.username,
        display_name: value.display_name,
        password: value.password,
        is_superuser: value.is_superuser,
      })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (user) => {
          this.users.update((users) => [...users, user]);
          this.createForm.reset({
            username: '',
            display_name: '',
            password: '',
            password_confirm: '',
            is_superuser: false,
          });
          this.message.set(`${user.display_name} kullanıcısı oluşturuldu.`);
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  setActive(user: AdminUser, isActive: boolean): void {
    this.updateUser(user, { is_active: isActive });
  }

  setSuperuser(user: AdminUser, isSuperuser: boolean): void {
    this.updateUser(user, { is_superuser: isSuperuser });
  }

  beginEdit(user: AdminUser): void {
    this.clearFeedback();
    this.editTarget.set(user);
    this.editUserForm.reset({ display_name: user.display_name });
  }

  cancelEdit(): void {
    this.editTarget.set(null);
  }

  saveDisplayName(): void {
    const target = this.editTarget();
    this.editUserForm.markAllAsTouched();
    if (!target || this.editUserForm.invalid || this.busy()) {
      return;
    }
    this.startAction();
    this.api
      .update(target.id, { display_name: this.editUserForm.getRawValue().display_name })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.users.update((users) =>
            users.map((item) => (item.id === updated.id ? updated : item)),
          );
          if (updated.id === this.me()?.id) {
            this.me.set(updated);
          }
          this.editTarget.set(null);
          this.message.set('Kullanıcı adı ve soyadı güncellendi.');
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  beginPasswordReset(user: AdminUser): void {
    this.clearFeedback();
    this.resetTarget.set(user);
    this.resetPasswordForm.reset({ new_password: '', password_confirm: '' });
  }

  cancelPasswordReset(): void {
    this.resetTarget.set(null);
    this.resetPasswordForm.reset({ new_password: '', password_confirm: '' });
  }

  resetPassword(): void {
    const target = this.resetTarget();
    const value = this.resetPasswordForm.getRawValue();
    this.resetPasswordForm.markAllAsTouched();
    if (
      !target ||
      this.resetPasswordForm.invalid ||
      value.new_password !== value.password_confirm ||
      this.busy()
    ) {
      if (value.new_password !== value.password_confirm) {
        this.error.set('Yeni parolalar eşleşmiyor.');
      }
      return;
    }
    this.startAction();
    this.api
      .resetPassword(target.id, value.new_password)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.message.set(`${target.display_name} için yeni parola kaydedildi.`);
          this.cancelPasswordReset();
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  changeOwnPassword(): void {
    const value = this.ownPasswordForm.getRawValue();
    this.ownPasswordForm.markAllAsTouched();
    if (
      this.ownPasswordForm.invalid ||
      value.new_password !== value.password_confirm ||
      this.busy()
    ) {
      if (value.new_password !== value.password_confirm) {
        this.error.set('Yeni parolalar eşleşmiyor.');
      }
      return;
    }
    this.startAction();
    this.api
      .changeOwnPassword(value.current_password, value.new_password)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.auth.logout();
          void this.router.navigate(['/admin/giris'], {
            queryParams: { parola: 'degisti' },
          });
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  private updateUser(user: AdminUser, payload: AdminUserUpdate): void {
    if (this.busy()) {
      return;
    }
    this.startAction();
    this.api
      .update(user.id, payload)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.users.update((users) =>
            users.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.message.set(`${updated.display_name} güncellendi.`);
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  private startAction(): void {
    this.clearFeedback();
    this.busy.set(true);
  }

  private clearFeedback(): void {
    this.error.set(null);
    this.message.set(null);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'Mevcut parola doğru değil veya oturumunuz sona erdi.';
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'Bu işlem için sistem yöneticisi yetkisi gerekiyor.';
    }
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return typeof error.error?.detail === 'string'
        ? error.error.detail
        : 'Kullanıcı adı kullanılıyor veya son yönetici hesabı değiştirilemez.';
    }
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Bilgileri kontrol edin. Parola en az 12 karakter olmalıdır.';
    }
    return 'İşlem tamamlanamadı. Lütfen yeniden deneyin.';
  }
}
