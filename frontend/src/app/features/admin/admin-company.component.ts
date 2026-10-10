import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CompanyAccount, CompanyService } from '../../core/company.service';

@Component({
  selector: 'app-admin-company',
  imports: [DatePipe, RouterLink],
  templateUrl: './admin-company.component.html',
  styleUrl: './admin-company.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCompanyComponent implements OnInit {
  private readonly api = inject(CompanyService);
  readonly account = signal<CompanyAccount | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    this.api
      .current()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (account) => this.account.set(account),
        error: () => this.error.set(true),
      });
  }

  planLabel(plan: string): string {
    return (
      (
        {
          legacy: 'Mevcut firma paketi',
          trial: 'Deneme',
          starter: 'Başlangıç',
          pro: 'Profesyonel',
          enterprise: 'Kurumsal',
        } as Record<string, string>
      )[plan] ?? plan
    );
  }

  percent(used: number, limit: number | null): number {
    return limit === null ? 0 : Math.min(100, Math.max(0, (used / Math.max(limit, 1)) * 100));
  }
}
