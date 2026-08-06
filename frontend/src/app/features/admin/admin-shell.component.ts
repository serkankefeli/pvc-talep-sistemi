import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SiteBrandingService } from '../../core/site-branding.service';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly brandingService = inject(SiteBrandingService);

  readonly branding = this.brandingService.branding;
  readonly brandMark = this.brandingService.brandMark;

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/admin/giris']);
  }
}
