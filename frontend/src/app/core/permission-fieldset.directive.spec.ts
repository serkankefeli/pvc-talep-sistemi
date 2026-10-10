import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { PermissionFieldsetDirective } from './permission-fieldset.directive';

@Component({
  imports: [PermissionFieldsetDirective],
  template: `<fieldset appPermission="catalog.edit">
    <input aria-label="Title" /><button>Save</button>
  </fieldset>`,
})
class FixtureComponent {}

describe('PermissionFieldsetDirective', () => {
  it('disables controls for view-only users and reenables them when editing is granted', () => {
    const editable = signal(false);
    TestBed.configureTestingModule({
      imports: [FixtureComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { can: (key: string) => key === 'catalog.edit' && editable() },
        },
      ],
    });
    const fixture = TestBed.createComponent(FixtureComponent);
    fixture.detectChanges();
    const fieldset = fixture.nativeElement.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('input').matches(':disabled')).toBe(true);
    editable.set(true);
    fixture.detectChanges();
    expect(fieldset.disabled).toBe(false);
  });
});
