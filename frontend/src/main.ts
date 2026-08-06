import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { loadRuntimeConfig, RUNTIME_CONFIG } from './app/core/runtime-config';

loadRuntimeConfig()
  .then((runtimeConfig) =>
    bootstrapApplication(App, {
      ...appConfig,
      providers: [
        ...(appConfig.providers ?? []),
        { provide: RUNTIME_CONFIG, useValue: runtimeConfig },
      ],
    }),
  )
  .catch((error: unknown) => console.error(error));
