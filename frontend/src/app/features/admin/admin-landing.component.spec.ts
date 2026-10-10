import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { LandingService } from '../../core/landing.service';
import { AuthService } from '../../core/auth.service';
import { testPage } from '../landing/landing.test-data';
import { AdminLandingComponent } from './admin-landing.component';

describe('AdminLandingComponent', () => {
  function setup() {
    const api = {
      adminPage: vi.fn(() => of(testPage())),
      save: vi.fn((page) => of({ ...page, revision: 2 })),
      upload: vi.fn(() => of({ url: '/api/v1/landing-media/' + 'a'.repeat(40) })),
      mediaUrl: (url: string) => url,
    };
    TestBed.configureTestingModule({
      imports: [AdminLandingComponent],
      providers: [
        provideRouter([]),
        { provide: LandingService, useValue: api },
        { provide: AuthService, useValue: { can: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(AdminLandingComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api };
  }
  it('adds removes and reorders managed sections/cards without losing removed-section content', () => {
    const { component } = setup();
    const page = component.page()!;
    component.move(page.sections, 0, 1);
    expect(page.sections[0].key).toBe('faq');
    component.addCard('features');
    expect(page.features).toHaveLength(2);
    page.sections.splice(
      page.sections.findIndex((section) => section.key === 'features'),
      1,
    );
    component.newSection = 'features';
    component.addSection();
    component.addSection();
    expect(page.sections.filter((section) => section.key === 'features')).toHaveLength(1);
    expect(page.features).toHaveLength(2);
  });
  it('saves publication settings and updated revision', () => {
    const { component, api } = setup();
    component.page()!.published = false;
    component.save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ published: false, revision: 1 }),
    );
    expect(component.page()!.revision).toBe(2);
    expect(component.message()).toContain('yayından kaldırıldı');
  });
  it('keeps local edits when a save conflicts instead of claiming success', () => {
    const { component, api } = setup();
    api.save.mockReturnValue(
      throwError(() => ({ error: { detail: 'Sayfa başka bir oturumda değişti' } })),
    );
    component.page()!.hero_title = 'Unsaved edit';
    component.save();
    expect(component.page()!.hero_title).toBe('Unsaved edit');
    expect(component.message()).toContain('başka bir oturumda');
  });
  it('previews unsaved content without publishing it', () => {
    const { component, fixture, api } = setup();
    component.page()!.hero_title = 'Unsaved preview';
    component.preview.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-landing-view').textContent).toContain(
      'Unsaved preview',
    );
    expect(api.save).not.toHaveBeenCalled();
  });
  it('manages deployment descriptions and the purchase CTA', () => {
    const { component, api } = setup();
    component.newSection = 'deployment';
    component.addSection();
    component.addCard('deployment');
    component.cards('deployment')[0].title = 'My website integration';
    component.page()!.purchase_label = 'Yıllık abonelik al';
    component.save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        purchase_label: 'Yıllık abonelik al',
        deployment: expect.arrayContaining([
          expect.objectContaining({ title: 'My website integration' }),
        ]),
      }),
    );
  });
});
