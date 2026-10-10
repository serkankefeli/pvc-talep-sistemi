import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommerceService, DocumentKey } from '../../core/commerce.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

@Component({
  imports: [RouterLink],
  template: `<article class="legal-page">
    <a routerLink="/">← Ana sayfa</a>
    @if (document(); as doc) {
      <h1>{{ doc.title }}</h1>
      <p>Sürüm {{ doc.revision }}</p>
      <div class="legal-body">{{ doc.body }}</div>
    } @else {
      <h1>Sözleşme ve bilgilendirme</h1>
      <p role="status">{{ message() }}</p>
    }
  </article>`,
  styleUrl: './commerce.scss',
})
export class LegalComponent {
  readonly document = signal<{ title: string; body: string; revision: number } | null>(null);
  readonly message = signal('Yükleniyor…');
  constructor() {
    const api = inject(CommerceService);
    inject(ActivatedRoute)
      .data.pipe(
        switchMap((data) => {
          this.document.set(null);
          return api.legal(data['key'] as DocumentKey);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (doc) => this.document.set(doc),
        error: () =>
          this.message.set(
            'Metin henüz yayımlanmadı veya yüklenemedi. Lütfen hizmet yöneticisiyle iletişime geçin.',
          ),
      });
  }
}
