import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  specialSystemPanelCount,
  SpecialSystemModelComponent,
} from './special-system-model.component';

describe('SpecialSystemModelComponent', () => {
  let fixture: ComponentFixture<SpecialSystemModelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SpecialSystemModelComponent] }).compileComponents();
    fixture = TestBed.createComponent(SpecialSystemModelComponent);
  });

  it('renders the selected Hebeschiebe topology with its tracks and individual panels', () => {
    fixture.componentRef.setInput('model', 'hs_six');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.model-panel')).toHaveLength(6);
    expect(element.querySelector('.section-view')?.getAttribute('data-lanes')).toBe('3');
    expect(element.querySelectorAll('.section-leaf')).toHaveLength(6);
    expect(element.querySelectorAll('.section-leaf[data-lane="0"]')).toHaveLength(2);
    expect(element.querySelectorAll('.sash-profile')).toHaveLength(6);
    expect(element.querySelector('.lift-slide-symbol')).toBeNull();
    expect(element.querySelectorAll('.movement-arrow')).toHaveLength(4);
    expect(element.querySelectorAll('.movement-guides i')).toHaveLength(6);
    expect(element.querySelector('[data-motion="lift-slide"]')).toBeTruthy();
    expect(element.querySelector('[data-model="hs_six"]')).toBeTruthy();
  });

  it('uses technical movement arrows for regular sliding systems', () => {
    fixture.componentRef.setInput('model', 'vw_two_left');
    fixture.componentRef.setInput('profileColor', '#a96937');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.movement-arrow')).toHaveLength(1);
    expect(element.querySelector('[data-motion="sliding"]')).toBeTruthy();
    expect(element.querySelector('.system-model')?.getAttribute('style')).toContain(
      '--profile-color: #a96937',
    );
  });

  it('renders pivot fanlight and folding leaf variants differently', () => {
    fixture.componentRef.setInput('model', 'pivot_fixed_fanlight');
    fixture.componentRef.setInput('pivotOpeningDirection', 'up');
    fixture.componentRef.setInput('verticalMullionCount', 2);
    fixture.componentRef.setInput('horizontalMullionCount', 1);
    fixture.componentRef.setInput('infillType', 'mixed');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.fanlight')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.model-panel')).toHaveLength(2);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.system-model')
        ?.getAttribute('data-pivot-opening'),
    ).toBe('up');
    expect((fixture.nativeElement as HTMLElement).querySelector('.up-opening')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.pivot-direction-arrow')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.pivot-glazing-bar.vertical')).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.pivot-glazing-bar.horizontal')).toHaveLength(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.system-model')?.getAttribute('data-infill'),
    ).toBe('mixed');

    fixture.componentRef.setInput('model', 'fold_nine');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.fanlight')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.model-panel')).toHaveLength(9);
    expect(specialSystemPanelCount('fold_nine')).toBe(9);
  });

  it('keeps a pivot closed until the customer chooses an opening direction', () => {
    fixture.componentRef.setInput('model', 'pivot_single');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="pivot-drawing"]')).toBeTruthy();
    expect(element.querySelector('.system-model')?.getAttribute('data-pivot-opening')).toBe('none');
    expect(element.querySelector('.pivot-neutral-marker')).toBeTruthy();
    expect(element.querySelector('.pivot-opening-marker')).toBeNull();
    expect(element.querySelector('.pivot-direction-arrow')).toBeNull();
  });

  it('uses a stable technical axis and arrow for side opening', () => {
    fixture.componentRef.setInput('model', 'pivot_single');
    fixture.componentRef.setInput('pivotOpeningDirection', 'side');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.side-opening')).toBeTruthy();
    expect(element.querySelector('.side-opening .pivot-axis')?.getAttribute('x1')).toBe('50');
    expect(element.querySelector('.side-opening .pivot-axis')?.getAttribute('x2')).toBe('50');
    expect(element.querySelector('.pivot-direction-arrow')).toBeTruthy();
  });

  it('maps customer technical measurements to the pivot frame, axis and hardware', () => {
    fixture.componentRef.setInput('model', 'pivot_single');
    fixture.componentRef.setInput('widthMm', 2000);
    fixture.componentRef.setInput('heightMm', 2400);
    fixture.componentRef.setInput('frameProfileWidthMm', 120);
    fixture.componentRef.setInput('mullionProfileWidthMm', 80);
    fixture.componentRef.setInput('glazingBarWidthMm', 30);
    fixture.componentRef.setInput('pivotOpeningDirection', 'side');
    fixture.componentRef.setInput('pivotAxisOffsetMm', 500);
    fixture.componentRef.setInput('hingeType', 'heavy_duty');
    fixture.componentRef.setInput('lockType', 'multipoint');
    fixture.componentRef.setInput('lockHeightMm', 1000);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(Number(element.querySelector('.pivot-sash')?.getAttribute('x'))).toBeCloseTo(6, 3);
    expect(element.querySelector('.pivot-axis')?.getAttribute('x1')).toBe('25');
    expect(element.querySelectorAll('.pivot-hinge')).toHaveLength(2);
    expect(element.querySelector('[data-lock-type="multipoint"]')).toBeTruthy();
    expect(element.querySelectorAll('.pivot-lock-point')).toHaveLength(2);
  });
});
