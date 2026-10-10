import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import {
  LandingCard,
  LandingContent,
  LandingService,
  SectionKey,
} from '../../core/landing.service';
import { LandingViewComponent } from '../landing/landing-view.component';
import { PermissionFieldsetDirective } from '../../core/permission-fieldset.directive';

@Component({
  imports: [FormsModule, LandingViewComponent, PermissionFieldsetDirective],
  templateUrl: './admin-landing.component.html',
  styleUrl: './admin-landing.component.scss',
})
export class AdminLandingComponent {
  private readonly api = inject(LandingService);
  readonly page = signal<LandingContent | null>(null);
  readonly busy = signal(false);
  readonly preview = signal(false);
  readonly message = signal('');
  readonly targets = [
    { value: '/satin-al', label: 'Yıllık abonelik / satın al' },
    { value: '/talep-olustur', label: 'Talep / çizim ekranı' },
    { value: '/admin/giris', label: 'Yönetici girişi' },
    { value: '#iletisim', label: 'İletişim bölümü' },
    { value: '#ozellikler', label: 'Özellikler bölümü' },
  ];
  readonly sectionLabels: Record<SectionKey, string> = {
    features: 'Özellikler',
    deployment: 'Firma sayfası ve kullanım biçimleri',
    process: 'Çalışma adımları',
    gallery: 'Model / görsel kartları',
    faq: 'Sık sorulan sorular',
    contact: 'İletişim',
  };
  readonly keys: SectionKey[] = ['features', 'deployment', 'process', 'gallery', 'faq', 'contact'];
  newSection: SectionKey = 'features';
  constructor() {
    this.reload();
  }
  reload(): void {
    this.api.adminPage().subscribe({
      next: (page) => {
        this.page.set(page);
        this.message.set('');
      },
      error: () => this.message.set('İçerik yüklenemedi. Sistem yöneticisi yetkisi gereklidir.'),
    });
  }
  save(): void {
    const page = this.page();
    if (!page || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.api
      .save({ ...page, contact_email: page.contact_email?.trim() || null })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.message.set(
            page.published
              ? 'Tanıtım sayfası kaydedildi ve yayında.'
              : 'Kaydedildi. Tanıtım sayfası yayından kaldırıldı.',
          );
        },
        error: (error: HttpErrorResponse) =>
          this.message.set(
            typeof error.error?.detail === 'string'
              ? error.error.detail
              : 'Kaydedilemedi. Alan uzunluklarını, e-posta, telefon ve görsel adreslerini kontrol edin.',
          ),
      });
  }
  move<T>(items: T[], index: number, offset: number): void {
    const next = index + offset;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
  }
  addSection(): void {
    const page = this.page();
    if (!page || page.sections.some((section) => section.key === this.newSection)) return;
    page.sections.push({
      key: this.newSection,
      enabled: true,
      title: this.sectionLabels[this.newSection],
      description: '',
    });
  }
  cards(key: SectionKey): LandingCard[] {
    const page = this.page();
    return page &&
      (key === 'features' || key === 'deployment' || key === 'process' || key === 'gallery')
      ? page[key]
      : [];
  }
  addCard(key: SectionKey): void {
    const cards = this.cards(key);
    if (cards.length >= (key === 'deployment' ? 8 : key === 'process' ? 10 : 16)) return;
    cards.push({ title: 'Yeni başlık', description: '', image_url: '', image_alt: '' });
  }
  upload(event: Event, card?: LandingCard): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (!file || !this.page() || this.busy()) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      this.message.set('En fazla 2 MB PNG, JPEG veya WebP görsel seçin.');
      return;
    }
    this.busy.set(true);
    this.api
      .upload(file)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (result) => {
          if (card) card.image_url = result.url;
          else this.page()!.hero_image_url = result.url;
          this.message.set('Görsel yüklendi. Sayfaya uygulamak için kaydedin.');
        },
        error: () =>
          this.message.set('Görsel yüklenemedi. Dosya biçimini ve erişim yetkinizi kontrol edin.'),
      });
  }
}
