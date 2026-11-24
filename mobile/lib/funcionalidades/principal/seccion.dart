import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';

/// Las secciones de la barra de abajo. Cada una con su nombre en la barra, su
/// ícono y el título de arriba.
enum Seccion {
  inicio('Inicio', Icons.home_outlined, 'SnapIt'),
  mapa('Mapa', Icons.map_outlined, 'Mapa de incidentes'),
  reportar('Reportar', Icons.add_a_photo_outlined, 'Reportar un problema'),
  perfil('Mi perfil', Icons.person_outline, 'Mi perfil'),
  recorrido('Recorrido', Icons.route_outlined, 'Recorrido accesible');

  const Seccion(this.nombre, this.icono, this.titulo);

  final String nombre;
  final IconData icono;
  final String titulo;

  /// Las que ve cada rol: el vecino, todas; operador y administrador no
  /// reportan ni calculan recorridos.
  static List<Seccion> de(Rol rol) => rol == Rol.vecino
      ? values
      : const [Seccion.inicio, Seccion.mapa, Seccion.perfil];
}

/// La sección abierta. Vive fuera de la pantalla principal para que la barra,
/// que queda fija también sobre los detalles, sepa cuál marcar y pueda
/// volver a una.
final seccionProvider = NotifierProvider<SeccionAbierta, Seccion>(
  SeccionAbierta.new,
);

class SeccionAbierta extends Notifier<Seccion> {
  // Con otra cuenta (o al salir y volver a entrar) se arranca en el inicio.
  @override
  Seccion build() {
    ref.watch(sesionProvider.select((sesion) => sesion.value?.id));
    return Seccion.inicio;
  }

  void abrir(Seccion seccion) => state = seccion;
}
