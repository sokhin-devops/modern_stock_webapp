import { Pipe, PipeTransform } from '@angular/core';

import { environment } from '../../environments/environment';

/** A stored picture's path from the API (/public/files/...) as a full address for an <img>, or null. */
@Pipe({ name: 'apiFile' })
export class ApiFilePipe implements PipeTransform {
  transform(path: string | null | undefined): string | null {
    return path ? environment.apiUrl + path : null;
  }
}
