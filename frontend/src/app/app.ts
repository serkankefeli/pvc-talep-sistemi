import { Title } from '@angular/platform-browser';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SiteBrandingService } from './core/site-branding.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly auth = inject(AuthService);
  private readonly brandingService = inject(SiteBrandingService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly themeService = inject(ThemeService);

  readonly branding = this.brandingService.branding;
  readonly brandMark = this.brandingService.brandMark;
  readonly theme = this.themeService.theme;

  constructor() {
    this.brandingService.loadPublic().subscribe({ error: () => undefined });
    effect(() => this.title.setTitle(`${this.branding().brand_name} | Görsel Talep`));
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/admin/giris']);
  }
}
