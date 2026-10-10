import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CommerceService } from '../../core/commerce.service';
import { LegalComponent } from './legal.component';

describe('LegalComponent', () => {
  it('renders legal content as text, not executable HTML', () => {
    const api = {
      legal: vi.fn(() =>
        of({ title: 'Test Privacy', body: '<img src=x onerror=alert(1)>', revision: 3 }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [LegalComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { data: of({ key: 'privacy' }) } },
        { provide: CommerceService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(LegalComponent);
    fixture.detectChanges();
    expect(api.legal).toHaveBeenCalledWith('privacy');
    expect(fixture.nativeElement.querySelector('.legal-body img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<img');
  });
  it('does not present an unpublished draft as a final agreement', () => {
    TestBed.configureTestingModule({
      imports: [LegalComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { data: of({ key: 'privacy' }) } },
        {
          provide: CommerceService,
          useValue: { legal: () => throwError(() => ({ status: 404 })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(LegalComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('henüz yayımlanmadı');
  });
});
