import { TestBed } from '@angular/core/testing';
import { PermissionMatrixComponent } from './permission-matrix.component';

describe('PermissionMatrixComponent', () => {
  function setup(selected: readonly string[] = []) {
    const fixture = TestBed.createComponent(PermissionMatrixComponent);
    fixture.componentRef.setInput('groups', [
      {
        key: 'requests',
        label: 'Talep',
        actions: [
          { key: 'requests.view', label: 'Görüntüle' },
          { key: 'requests.edit', label: 'Düzenle' },
          { key: 'requests.email', label: 'E-posta' },
        ],
      },
    ]);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    const changes: (readonly string[])[] = [];
    fixture.componentInstance.selectionChange.subscribe((value) => changes.push(value));
    return { fixture, component: fixture.componentInstance, changes };
  }
  it('selecting edit also selects view but does not grant email', () => {
    const { component, changes } = setup();
    component.toggle('requests.edit', { target: { checked: true } } as unknown as Event);
    expect(changes[0]).toEqual(['requests.edit', 'requests.view']);
  });
  it('removing view removes dependent actions', () => {
    const { component, changes } = setup(['requests.view', 'requests.edit', 'requests.email']);
    component.toggle('requests.view', { target: { checked: false } } as unknown as Event);
    expect(changes[0]).toEqual([]);
  });
  it('view-only preset selects only view permissions', () => {
    const { component, changes } = setup();
    component.preset('view');
    expect(changes[0]).toEqual(['requests.view']);
  });
  it('cannot alter selection while disabled', () => {
    const { fixture, component, changes } = setup();
    fixture.componentRef.setInput('disabled', true);
    component.preset('all');
    expect(changes).toEqual([]);
  });
});
