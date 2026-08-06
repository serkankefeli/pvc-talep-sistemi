import { TestBed } from '@angular/core/testing';
import { BalconyPlanPreviewComponent } from './balcony-plan-preview.component';

describe('BalconyPlanPreviewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BalconyPlanPreviewComponent],
    }).compileComponents();
  });

  it('emits the clicked face and exposes the selected face to assistive technology', () => {
    const fixture = TestBed.createComponent(BalconyPlanPreviewComponent);
    fixture.componentRef.setInput('segments', [
      { label: 'A ana cephe', width_mm: 4000, turn_degrees: 0 },
      { label: 'B yan cephe', width_mm: 1800, turn_degrees: 90 },
    ]);
    fixture.componentRef.setInput('shape', 'l_shape');
    fixture.componentRef.setInput('shapeLabel', 'L balkon');
    fixture.componentRef.setInput('ready', true);
    fixture.componentRef.setInput('selectable', true);
    fixture.componentRef.setInput('selectedIndex', 1);

    let selectedIndex = -1;
    const subscription = fixture.componentInstance.segmentSelected.subscribe((index) => {
      selectedIndex = index;
    });
    fixture.detectChanges();

    const faceButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.plan-canvas button.plan-line',
      ),
    );
    expect(faceButtons).toHaveLength(2);
    expect(faceButtons[0].getAttribute('aria-pressed')).toBe('false');
    expect(faceButtons[1].getAttribute('aria-pressed')).toBe('true');
    expect(faceButtons[1].getAttribute('aria-label')).toContain('B yan cephe');

    faceButtons[0].click();

    expect(selectedIndex).toBe(0);
    subscription.unsubscribe();
  });
});
