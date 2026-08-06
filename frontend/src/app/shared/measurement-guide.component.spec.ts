import { TestBed } from '@angular/core/testing';
import { FALLBACK_CATALOG_PRODUCTS } from '../core/fallback-catalog';
import { MeasurementGuideComponent } from './measurement-guide.component';

describe('MeasurementGuideComponent', () => {
  it('has typed guidance for every public product', () => {
    expect(
      FALLBACK_CATALOG_PRODUCTS.every(
        (product) =>
          product.measurement.width_instruction && product.measurement.height_instruction,
      ),
    ).toBe(true);
  });

  it('renders a safe SVG and the visible discovery-measure warning', async () => {
    await TestBed.configureTestingModule({
      imports: [MeasurementGuideComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(MeasurementGuideComponent);
    fixture.componentRef.setInput(
      'measurement',
      FALLBACK_CATALOG_PRODUCTS.find((product) => product.key === 'balcony_enclosure')!.measurement,
    );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('svg')).toBeTruthy();
    expect(element.querySelectorAll('[innerhtml]')).toHaveLength(0);
    expect(element.textContent).toContain(
      'Bu yaklaşık ön talep ölçüsüdür, imalat ölçüsü değildir.',
    );
    expect(element.textContent).toContain('dışarı sarkmayın');
  });
});
