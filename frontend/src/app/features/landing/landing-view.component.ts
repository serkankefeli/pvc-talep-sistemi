import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicOffer } from '../../core/commerce.service';
import { LandingContent, LandingService } from '../../core/landing.service';

@Component({
  selector: 'app-landing-view',
  imports: [RouterLink],
  templateUrl: './landing-view.component.html',
  styleUrl: './landing-view.component.scss',
})
export class LandingViewComponent {
  readonly page = input.required<LandingContent>();
  readonly offer = input<PublicOffer | null>(null);
  readonly mediaUrl = inject(LandingService).mediaUrl.bind(inject(LandingService));
  readonly icons = ['↗', '▦', '▤', '⌘'];
  sectionId(key: string): string {
    return key === 'contact' ? 'iletisim' : key === 'features' ? 'ozellikler' : key;
  }
  phoneUrl(phone: string): string {
    return 'tel:' + phone.replace(/[^+0-9]/g, '');
  }
}
