import { Title } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SiteBrandingService } from './core/site-branding.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly brandingService = inject(SiteBrandingService);
  private readonly title = inject(Title);

  readonly branding = this.brandingService.branding;
  readonly brandMark = this.brandingService.brandMark;

  constructor() {
    this.brandingService.loadPublic().subscribe({ error: () => undefined });
    effect(() => this.title.setTitle(`${this.branding().brand_name} | Görsel Talep`));
  }
}
