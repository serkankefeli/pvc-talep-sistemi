import { LandingContent } from '../../core/landing.service';

export function testPage(): LandingContent {
  return {
    revision: 1,
    published: true,
    seo_title: 'Test Title',
    seo_description: 'Test description',
    eyebrow: 'Test Label',
    hero_title: 'Test Hero',
    hero_description: 'Test Lead',
    hero_image_url: '',
    hero_image_alt: '',
    primary_label: 'Test Draw',
    primary_target: '/talep-olustur',
    secondary_label: 'Test Contact',
    secondary_target: '#iletisim',
    purchase_visible: true,
    purchase_label: 'Satın al',
    deployment: [],
    badges: ['Test Badge'],
    features: [
      {
        title: 'Test Feature',
        description: 'Test Feature Description',
        image_url: '',
        image_alt: '',
      },
    ],
    process: [],
    gallery: [],
    faq: [{ question: 'Test Question?', answer: 'Test Answer' }],
    sections: [
      { key: 'features', enabled: true, title: 'Test Features', description: '' },
      { key: 'faq', enabled: true, title: 'Test FAQ', description: '' },
      { key: 'contact', enabled: true, title: 'Test Contact', description: '' },
    ],
    contact_title: 'Test Contact Title',
    contact_description: 'Test Contact description',
    contact_email: null,
    contact_phone: '',
    contact_address: '',
    closing_title: 'Test Closing',
    closing_description: 'Test Closing Description',
    closing_label: 'Test Start',
    closing_target: '/talep-olustur',
  };
}
