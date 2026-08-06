import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { SiteBrandingService } from '../../core/site-branding.service';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Component({
  selector: 'app-admin-branding',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-branding.component.html',
  styleUrl: './admin-branding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBrandingComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SiteBrandingService);

  readonly branding = this.api.branding;
  readonly brandMark = this.api.brandMark;
  readonly selectedFile = signal<File | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  readonly form = this.fb.group({
    brand_name: this.fb.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(120),
    ]),
    tagline: this.fb.control('', Validators.maxLength(200)),
    logo_alt: this.fb.control('', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(160),
    ]),
  });

  ngOnInit(): void {
    this.api
      .loadAdmin()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (branding) =>
          this.form.reset({
            brand_name: branding.brand_name,
            tagline: branding.tagline,
            logo_alt: branding.logo_alt,
          }),
        error: () => this.error.set('Marka bilgileri yüklenemedi. Lütfen yeniden deneyin.'),
      });
  }

  selectLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.clearFeedback();
    this.selectedFile.set(null);
    if (!file) {
      return;
    }
    if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
      this.error.set('Yalnızca PNG, JPG/JPEG veya WebP dosyası seçebilirsiniz.');
      input.value = '';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.error.set('Logo dosyası en fazla 2 MB olabilir.');
      input.value = '';
      return;
    }
    this.selectedFile.set(file);
  }

  saveText(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) {
      return;
    }
    this.startAction();
    this.api
      .update(this.form.getRawValue())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => this.message.set('Marka metinleri kaydedildi.'),
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  uploadLogo(): void {
    const file = this.selectedFile();
    if (!file || this.busy()) {
      return;
    }
    this.startAction();
    this.api
      .uploadLogo(file)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.selectedFile.set(null);
          this.message.set('Logo yüklendi ve tüm ekranlarda güncellendi.');
        },
        error: (error: unknown) => this.error.set(this.errorMessage(error)),
      });
  }

  removeLogo(): void {
    if (!this.branding().logo_url || this.busy()) {
      return;
    }
    this.startAction();
    this.api
      .deleteLogo()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => this.message.set('Logo kaldırıldı. Metin işareti kullanılacak.'),
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
    if (error instanceof HttpErrorResponse && error.status === 413) {
      return 'Logo dosyası sunucu sınırını aşıyor.';
    }
    if (error instanceof HttpErrorResponse && error.status === 415) {
      return 'Dosyanın içeriği geçerli bir PNG, JPG/JPEG veya WebP görseli değil.';
    }
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Alanları kontrol edin; HTML veya çalıştırılabilir içerik kullanılamaz.';
    }
    return 'İşlem tamamlanamadı. Lütfen bağlantınızı kontrol edip yeniden deneyin.';
  }
}
