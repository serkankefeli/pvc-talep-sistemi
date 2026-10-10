import { Component, input, output } from '@angular/core';
import { PermissionGroup } from '../../core/admin-users.service';

@Component({
  selector: 'app-permission-matrix',
  template: `
    <div class="permission-presets">
      <button type="button" (click)="preset('view')" [disabled]="disabled()">
        Yalnızca görüntüle
      </button>
      <button type="button" (click)="preset('all')" [disabled]="disabled()">
        Tüm ekran yetkileri
      </button>
      <button type="button" (click)="preset('none')" [disabled]="disabled()">
        Yetkileri temizle
      </button>
    </div>
    @for (group of groups(); track group.key) {
      <fieldset class="permission-row" [disabled]="disabled()">
        <legend>{{ group.label }}</legend>
        @for (action of group.actions; track action.key) {
          <label
            ><input
              type="checkbox"
              [checked]="selected().includes(action.key)"
              (change)="toggle(action.key, $event)"
            />
            {{ action.label }}</label
          >
        }
      </fieldset>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.65rem;
    }
    .permission-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    button {
      background: var(--surface);
      color: var(--forest);
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      cursor: pointer;
      padding: 0.5rem 0.65rem;
      font: inherit;
      font-size: 0.75rem;
    }
    .permission-row {
      border: 1px solid var(--line);
      border-radius: 0.65rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 1rem;
      margin: 0;
      min-width: 0;
      padding: 0.7rem;
    }
    legend {
      font-weight: 800;
      font-size: 0.8rem;
      padding: 0 0.3rem;
    }
    label {
      align-items: center;
      display: flex;
      gap: 0.4rem;
      font-size: 0.78rem;
    }
    input {
      width: 1rem;
      height: 1rem;
      accent-color: var(--forest);
    }
  `,
})
export class PermissionMatrixComponent {
  readonly groups = input.required<readonly PermissionGroup[]>();
  readonly selected = input.required<readonly string[]>();
  readonly disabled = input(false);
  readonly selectionChange = output<readonly string[]>();

  toggle(key: string, event: Event): void {
    if (this.disabled()) return;
    const checked = (event.target as HTMLInputElement).checked;
    const values = new Set(this.selected());
    const resource = key.split('.')[0];
    if (checked) {
      values.add(key);
      values.add(resource + '.view');
    } else {
      values.delete(key);
      if (key.endsWith('.view')) {
        [...values]
          .filter((value) => value.startsWith(resource + '.'))
          .forEach((value) => values.delete(value));
      }
    }
    this.selectionChange.emit([...values].sort());
  }

  preset(mode: 'view' | 'all' | 'none'): void {
    if (this.disabled()) return;
    const keys = this.groups().flatMap((group) => group.actions.map((action) => action.key));
    this.selectionChange.emit(
      mode === 'none' ? [] : keys.filter((key) => mode === 'all' || key.endsWith('.view')).sort(),
    );
  }
}
