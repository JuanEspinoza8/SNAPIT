enum Rol {
  vecino('Vecino'),
  operador('Operador'),
  administrador('Administrador');

  const Rol(this.etiqueta);

  final String etiqueta;
}

/// El objeto `usuario` de `docs/api.md`, con lo que la app necesita.
class Usuario {
  const Usuario({
    required this.id,
    required this.email,
    required this.nombre,
    required this.rol,
  });

  factory Usuario.desdeJson(Map<String, dynamic> json) {
    final rol = _roles[json['rol']];
    if (rol == null) throw FormatException('Rol desconocido: ${json['rol']}');
    return Usuario(
      id: json['id'] as int,
      email: json['email'] as String,
      nombre: json['nombre'] as String,
      rol: rol,
    );
  }

  final int id;
  final String email;
  final String nombre;
  final Rol rol;

  static const _roles = {
    'VECINO': Rol.vecino,
    'OPERADOR': Rol.operador,
    'ADMINISTRADOR': Rol.administrador,
  };
}
