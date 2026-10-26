# Project Instructions

## Stack

- This is a Laravel 10 application targeting PHP 8.1 or newer.
- The frontend uses Vue 3 and Vite; follow the existing JavaScript and Blade patterns.
- Keep changes focused and avoid modifying generated files, `vendor/`, or installed frontend dependencies.

## Development

- Inspect related routes, controllers, models, views, and tests before changing behavior.
- Preserve existing database and user-interface behavior unless the task explicitly calls for a change.
- Do not read or expose `.env` files, credentials, or other secrets.
- Avoid adding dependencies when the existing Laravel and frontend stack can handle the requirement.

## Validation

- Run focused PHPUnit tests for PHP changes; use `php artisan test` when the change affects broader behavior.
- Run `npm run build` for frontend or Vite configuration changes.
- Report validation that could not be run and the reason.
