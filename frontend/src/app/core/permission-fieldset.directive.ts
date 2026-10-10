import { Directive, HostBinding, inject, input } from '@angular/core';
import { AuthService } from './auth.service';

/** Native disabled fieldset: descendant controls are read-only, text remains accessible. */
@Directive({ selector: 'fieldset[appPermission]' })
export class PermissionFieldsetDirective {
  private readonly auth = inject(AuthService);
  readonly appPermission = input.required<string>();
  @HostBinding('disabled') get disabled(): boolean {
    return !this.auth.can(this.appPermission());
  }
  @HostBinding('style.display') readonly display = 'contents';
}
