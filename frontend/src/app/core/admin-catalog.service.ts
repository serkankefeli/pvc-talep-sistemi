import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminCatalogField,
  AdminCatalogOption,
  AdminCatalogProduct,
  CatalogFieldWrite,
  CatalogOptionWrite,
  CatalogProductWrite,
} from './catalog.models';
import { RUNTIME_CONFIG } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class AdminCatalogService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private readonly baseUrl = `${this.config.apiUrl}/api/v1/admin/catalog`;

  loadProducts(): Observable<readonly AdminCatalogProduct[]> {
    return this.http.get<readonly AdminCatalogProduct[]>(`${this.baseUrl}/products`);
  }

  createProduct(payload: CatalogProductWrite): Observable<AdminCatalogProduct> {
    return this.http.post<AdminCatalogProduct>(`${this.baseUrl}/products`, payload);
  }

  updateProduct(
    key: string,
    payload: Partial<Omit<CatalogProductWrite, 'key'>>,
  ): Observable<AdminCatalogProduct> {
    return this.http.patch<AdminCatalogProduct>(
      `${this.baseUrl}/products/${encodeURIComponent(key)}`,
      payload,
    );
  }

  loadFields(productKey: string): Observable<readonly AdminCatalogField[]> {
    return this.http.get<readonly AdminCatalogField[]>(
      `${this.baseUrl}/products/${encodeURIComponent(productKey)}/fields`,
    );
  }

  createField(productKey: string, payload: CatalogFieldWrite): Observable<AdminCatalogField> {
    return this.http.post<AdminCatalogField>(
      `${this.baseUrl}/products/${encodeURIComponent(productKey)}/fields`,
      payload,
    );
  }

  updateField(
    id: number,
    payload: Partial<Omit<CatalogFieldWrite, 'key'>>,
  ): Observable<AdminCatalogField> {
    return this.http.patch<AdminCatalogField>(`${this.baseUrl}/fields/${id}`, payload);
  }

  deleteField(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/fields/${id}`);
  }

  loadOptions(fieldId: number): Observable<readonly AdminCatalogOption[]> {
    return this.http.get<readonly AdminCatalogOption[]>(
      `${this.baseUrl}/fields/${fieldId}/options`,
    );
  }

  createOption(fieldId: number, payload: CatalogOptionWrite): Observable<AdminCatalogOption> {
    return this.http.post<AdminCatalogOption>(
      `${this.baseUrl}/fields/${fieldId}/options`,
      payload,
    );
  }

  updateOption(
    id: number,
    payload: Partial<Omit<CatalogOptionWrite, 'value'>>,
  ): Observable<AdminCatalogOption> {
    return this.http.patch<AdminCatalogOption>(`${this.baseUrl}/options/${id}`, payload);
  }

  deleteOption(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/options/${id}`);
  }
}
