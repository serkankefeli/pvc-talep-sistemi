import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LandingContent, LandingService } from '../../core/landing.service';
import { SiteBrandingService } from '../../core/site-branding.service';
import { CommerceService, PublicOffer } from '../../core/commerce.service';
import { LandingViewComponent } from './landing-view.component';

@Component({
  imports: [LandingViewComponent, RouterLink],
  template: `
    @if (page(); as content) {
      <app-landing-view [page]="content" [offer]="offer()" />
    } @else {
      <section style="max-width:900px;margin:4rem auto;padding:2rem">
        <h1>{{ message() }}</h1>
        <a routerLink="/talep-olustur">Görsel talep oluştur →</a>
      </section>
    }
  `,
})
export class LandingComponent {
  readonly page = signal<LandingContent | null>(null);
  readonly offer = signal<PublicOffer | null>(null);
  readonly message = signal('Tanıtım sayfası yükleniyor…');
  constructor() {
    const title = inject(Title);
    const meta = inject(Meta);
    const previousDescription = meta.getTag('name="description"')?.getAttribute('content');
    const injector = inject(Injector);
    const viewport = inject(ViewportScroller);
    const route = inject(ActivatedRoute);
    inject(CommerceService)
      .publicOffer()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (offer) => this.offer.set(offer),
        error: () => this.offer.set(null),
      });
    inject(DestroyRef).onDestroy(() => {
      if (previousDescription != null)
        meta.updateTag({ name: 'description', content: previousDescription });
      else meta.removeTag('name="description"');
    });
    const brand = inject(SiteBrandingService).branding;
    effect(() => {
      const page = this.page();
      if (page) {
        title.setTitle(`${page.seo_title} | ${brand().brand_name}`);
        meta.updateTag({ name: 'description', content: page.seo_description });
      }
    });
    inject(LandingService)
      .publicPage()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (value) => {
          if ('hero_title' in value && value.published) {
            this.page.set(value);
            // The first router scroll can precede the asynchronously loaded sections.
            afterNextRender(
              () => {
                const fragment = route.snapshot.fragment;
                if (fragment) viewport.scrollToAnchor(fragment);
              },
              { injector },
            );
          } else this.message.set('Tanıtım sayfası henüz yayımlanmadı.');
        },
        error: () =>
          this.message.set('Tanıtım sayfası yüklenemedi. Talep ekranından devam edebilirsiniz.'),
      });
  }
}
