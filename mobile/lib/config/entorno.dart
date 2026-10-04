/// Valores que se fijan al compilar con `--dart-define`, sin tocar el código.
abstract final class Entorno {
  /// URL base de la API, con `/api` al final.
  ///
  /// Por defecto apunta a la PC vista desde el emulador de Android (10.0.2.2).
  /// En un celular: `--dart-define=API_URL=http://<IP de la PC>:3000/api`.
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );
}
