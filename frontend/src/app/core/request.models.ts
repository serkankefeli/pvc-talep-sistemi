export type ProductType =
  | 'pvc_window'
  | 'pvc_door'
  | 'flyscreen'
  | 'guillotine_glass'
  | 'facade_cladding'
  | 'balcony_enclosure';

export type PreferredContact = 'phone' | 'email';
export type RequestStatus =
  'new' | 'reviewing' | 'contacted' | 'quoted' | 'won' | 'lost' | 'cancelled';

export interface DivisionLine {
  readonly axis: 'horizontal' | 'vertical';
  readonly position_percent: number;
}

export type JoineryPanelRole = 'window' | 'door';
export type JoineryPanelOpening = 'fixed' | 'turn' | 'tilt' | 'tilt_turn' | 'sliding';
export type JoineryPanelHinge = 'none' | 'left' | 'right';

export interface JoineryPanel {
  readonly slot: string;
  readonly label: string;
  readonly role: JoineryPanelRole;
  readonly x_percent: number;
  readonly y_percent: number;
  readonly width_percent: number;
  readonly height_percent: number;
  readonly opening: JoineryPanelOpening;
  readonly hinge: JoineryPanelHinge;
}

export interface PublicProductBase {
  readonly product_type: string;
  readonly width_mm: number;
  readonly height_mm: number;
  readonly quantity: number;
  readonly color: string;
  readonly profile_series: string | null;
  readonly notes: string | null;
  readonly drawing_version: '1' | '2';
  readonly catalog_answers: Readonly<Record<string, string | boolean | number>>;
  /** Snapshot used to keep an existing request's drawing stable after catalog edits. */
  readonly profile_spec?: BalconyProfileSpec | null;
}

export interface WindowItem extends PublicProductBase {
  readonly product_type: 'pvc_window';
  readonly layout:
    | 'fixed'
    | 'single_sash'
    | 'double_sash'
    | 'tilt_turn'
    | 'transom'
    | 'custom_grid'
    | 'window_door'
    | 'door_window'
    | 'window_door_window';
  readonly opening_direction: 'none' | 'left' | 'right' | 'inward' | 'outward';
  readonly glazing: string;
  readonly divisions: readonly DivisionLine[];
  readonly panels?: readonly JoineryPanel[];
}

export interface DoorItem extends PublicProductBase {
  readonly product_type: 'pvc_door';
  readonly layout:
    | 'single'
    | 'double'
    | 'balcony'
    | 'sliding'
    | 'window_door'
    | 'door_window'
    | 'window_door_window';
  readonly opening_direction: 'left' | 'right' | 'inward' | 'outward' | 'sliding';
  readonly glazing: string | null;
  readonly threshold: string;
  readonly divisions: readonly DivisionLine[];
  readonly panels?: readonly JoineryPanel[];
}

export interface FlyscreenItem extends PublicProductBase {
  readonly product_type: 'flyscreen';
  readonly screen_type: 'fixed' | 'hinged' | 'sliding' | 'roller' | 'pleated';
  readonly mesh_type: string;
}

export interface GuillotineGlassItem extends PublicProductBase {
  readonly product_type: 'guillotine_glass';
  readonly system_type: string;
  readonly panel_count: 2 | 3 | 4;
  readonly glass_type: string;
  readonly bottom_fixed: boolean;
}

export interface FacadeCladdingItem extends PublicProductBase {
  readonly product_type: 'facade_cladding';
  readonly cladding_type: string;
  readonly panel_orientation: 'horizontal' | 'vertical' | 'mixed';
  readonly installation_system: string;
  readonly insulation_required: boolean;
  readonly substructure_material: string;
}

export interface BalconySegment {
  readonly label: string;
  readonly width_mm: number;
  readonly turn_degrees: -90 | 0 | 90;
}

export interface BalconyProfileSpec {
  readonly edge_profile_mm: number;
  readonly mullion_profile_mm: number;
  readonly corner_profile_mm: number;
  readonly top_profile_mm: number;
  readonly bottom_profile_mm: number;
  readonly mounting_gap_mm: number;
  readonly min_glass_width_mm: number;
  readonly target_glass_width_mm: number;
  readonly max_glass_width_mm: number;
  readonly min_panel_count: number;
  readonly max_panel_count: number;
}

export interface BalconyEnclosureItem extends PublicProductBase {
  readonly product_type: 'balcony_enclosure';
  readonly system_type: 'sliding' | 'folding' | 'guillotine' | 'pvc_joinery';
  readonly enclosure_shape: string;
  readonly roof_required: boolean;
  readonly parapet_type: string;
  readonly segments: readonly BalconySegment[];
}

export type PublicProductItem =
  | WindowItem
  | DoorItem
  | FlyscreenItem
  | GuillotineGlassItem
  | FacadeCladdingItem
  | BalconyEnclosureItem;

export interface GenericProductItem extends PublicProductBase {
  readonly product_type: string;
}

export type PublicRequestItem = PublicProductItem | GenericProductItem;

export interface PublicRequestCreate {
  readonly contact: {
    readonly full_name: string;
    readonly company_name: string | null;
    readonly email: string | null;
    readonly phone: string | null;
    readonly preferred_contact: PreferredContact;
    readonly city: string | null;
    readonly district: string | null;
  };
  readonly items: readonly PublicRequestItem[];
  readonly project_note: string | null;
  readonly privacy_consent: true;
}

export interface PublicRequestCreated {
  readonly request_number: string;
  readonly status: 'received';
  readonly message: string;
}

export interface AdminTokenResponse {
  readonly access_token: string;
  readonly token_type: 'bearer';
  readonly expires_in: number;
}

export interface AdminRequestSummary {
  readonly id: number;
  readonly request_number: string;
  readonly status: RequestStatus;
  readonly favorite: boolean;
  readonly customer_name: string;
  readonly company_name: string | null;
  readonly customer_email: string | null;
  readonly customer_phone: string | null;
  readonly preferred_contact: PreferredContact;
  readonly product_count: number;
  // FastAPI serializes Decimal values as strings to preserve exact cents.
  readonly quoted_amount: string | null;
  readonly quote_currency: 'TRY';
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AdminRequestList {
  readonly items: readonly AdminRequestSummary[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminRequestDetail {
  readonly id: number;
  readonly request_number: string;
  readonly status: RequestStatus;
  readonly favorite: boolean;
  readonly contact: PublicRequestCreate['contact'];
  readonly project_note: string | null;
  readonly privacy_consent: boolean;
  readonly items: readonly PublicRequestItem[];
  readonly internal_notes: string | null;
  readonly quoted_amount: string | null;
  readonly quote_currency: 'TRY';
  readonly admin_notification_state: string;
  readonly admin_notified_at: string | null;
  readonly customer_email_sent_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AdminRequestUpdate {
  readonly status?: RequestStatus;
  readonly internal_notes?: string | null;
  readonly quoted_amount?: number | null;
}

export interface AdminRequestRevision {
  readonly id: number;
  readonly request_id: number;
  readonly revision_number: number;
  readonly note: string;
  readonly items: readonly PublicRequestItem[];
  readonly created_by: string;
  readonly created_at: string;
}

export interface CustomerEmailSend {
  readonly subject: string;
  readonly message: string;
  readonly include_quote: boolean;
}

export const STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  new: 'Yeni',
  reviewing: 'İnceleniyor',
  contacted: 'İletişime geçildi',
  quoted: 'Teklif hazırlandı',
  won: 'Onaylandı',
  lost: 'Kaybedildi',
  cancelled: 'İptal edildi',
};

export const PRODUCT_LABELS: Readonly<Record<ProductType, string>> = {
  pvc_window: 'PVC pencere',
  pvc_door: 'PVC kapı',
  flyscreen: 'Sineklik',
  guillotine_glass: 'Giyotin cam',
  facade_cladding: 'Dış cephe giydirme',
  balcony_enclosure: 'Balkon kapama',
};

const KNOWN_PRODUCT_TYPES = new Set<string>(Object.keys(PRODUCT_LABELS));

export function isKnownProductType(value: string): value is ProductType {
  return KNOWN_PRODUCT_TYPES.has(value);
}

export function productTypeLabel(value: string): string {
  if (isKnownProductType(value)) {
    return PRODUCT_LABELS[value];
  }
  return value.replaceAll('_', ' ');
}
