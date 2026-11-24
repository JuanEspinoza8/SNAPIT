import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../compartido/sesion/sesion.dart';
import 'borrador_reporte.dart';

final colaReportesProvider = Provider<ColaReportes>((ref) => ColaReportes());

final reportesPendientesProvider =
    AsyncNotifierProvider<ReportesPendientes, List<ReportePendiente>>(
      ReportesPendientes.new,
    );

class ReportePendiente {
  const ReportePendiente({
    required this.id,
    required this.usuarioId,
    required this.categoriaNombre,
    required this.borrador,
    this.rechazo,
  });

  final String id;

  /// El vecino que lo cargó. Solo se envía con su sesión: en un teléfono
  /// compartido, otro usuario no lo manda a su nombre.
  final int usuarioId;
  final String categoriaNombre;
  final BorradorReporte borrador;

  /// Por qué lo rechazó el servidor (por ejemplo, la categoría se dio de
  /// baja). Rechazado, ya no se reintenta: el vecino lo descarta.
  final String? rechazo;

  bool get rechazado => rechazo != null;

  ReportePendiente conRechazo(String motivo) => ReportePendiente(
    id: id,
    usuarioId: usuarioId,
    categoriaNombre: categoriaNombre,
    borrador: borrador,
    rechazo: motivo,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'usuarioId': usuarioId,
    'categoriaNombre': categoriaNombre,
    'borrador': borrador.toJson(),
    'rechazo': rechazo,
  };

  factory ReportePendiente.desdeJson(Map<String, dynamic> json) =>
      ReportePendiente(
        id: json['id'] as String,
        usuarioId: json['usuarioId'] as int,
        categoriaNombre: json['categoriaNombre'] as String,
        borrador: BorradorReporte.desdeJson(
          json['borrador'] as Map<String, dynamic>,
        ),
        rechazo: json['rechazo'] as String?,
      );
}

/// Los pendientes del usuario con sesión: los de otro usuario del mismo
/// teléfono no se ven.
class ReportesPendientes extends AsyncNotifier<List<ReportePendiente>> {
  @override
  Future<List<ReportePendiente>> build() {
    final usuario = ref.watch(sesionProvider).value;
    return _delUsuario(usuario?.id);
  }

  Future<void> actualizar() async {
    state = AsyncData(await _delUsuario(ref.read(sesionProvider).value?.id));
  }

  Future<List<ReportePendiente>> _delUsuario(int? usuarioId) async {
    if (usuarioId == null) return const [];
    final todos = await ref.read(colaReportesProvider).leer();
    return [
      for (final pendiente in todos)
        if (pendiente.usuarioId == usuarioId) pendiente,
    ];
  }
}

class ColaReportes {
  ColaReportes([this._prefs]);

  static const _clave = 'reportesPendientes';

  final SharedPreferences? _prefs;

  // Las operaciones leen la lista, la cambian y la vuelven a escribir: de a
  // una por vez, para que un envío que termina no pise un reporte que se está
  // guardando al mismo tiempo.
  Future<void> _ultima = Future.value();

  Future<T> _enSerie<T>(Future<T> Function() operacion) {
    final resultado = _ultima.then((_) => operacion());
    _ultima = resultado.then<void>((_) {}, onError: (_) {});
    return resultado;
  }

  Future<SharedPreferences> get _almacen {
    final prefs = _prefs;
    return prefs != null
        ? Future.value(prefs)
        : SharedPreferences.getInstance();
  }

  Future<List<ReportePendiente>> leer() async {
    final texto = (await _almacen).getString(_clave);
    if (texto == null) return const [];

    try {
      final datos = jsonDecode(texto) as List<dynamic>;
      return [
        for (final item in datos)
          // Uno guardado sin usuario no se puede enviar a nombre de nadie.
          if (item is Map<String, dynamic> && item['usuarioId'] is int)
            ReportePendiente.desdeJson(item),
      ];
    } on FormatException {
      return const [];
    }
  }

  Future<ReportePendiente> guardar(
    BorradorReporte borrador, {
    required int usuarioId,
    required String categoriaNombre,
  }) => _enSerie(() async {
    final id = DateTime.now().microsecondsSinceEpoch.toString();
    final fotoOriginal = borrador.foto!;

    final documentos = await getApplicationDocumentsDirectory();
    final carpeta = Directory(p.join(documentos.path, 'reportes-pendientes'));
    await carpeta.create(recursive: true);

    final destino = p.join(
      carpeta.path,
      '$id${p.extension(fotoOriginal.ruta)}',
    );
    final copia = await File(fotoOriginal.ruta).copy(destino);

    final borradorEstable = borrador.copyWith(
      foto: FotoReporte(
        ruta: copia.path,
        tomadaConCamaraApp: fotoOriginal.tomadaConCamaraApp,
      ),
    );

    final pendiente = ReportePendiente(
      id: id,
      usuarioId: usuarioId,
      categoriaNombre: categoriaNombre,
      borrador: borradorEstable,
    );

    await _escribir([...await leer(), pendiente]);
    return pendiente;
  });

  /// Lo deja guardado con el motivo y sin reintentar.
  Future<void> marcarRechazado(String id, String motivo) => _enSerie(() async {
    await _escribir([
      for (final pendiente in await leer())
        pendiente.id == id ? pendiente.conRechazo(motivo) : pendiente,
    ]);
  });

  Future<void> quitar(String id) => _enSerie(() async {
    final pendientes = await leer();
    final objetivo = pendientes.where((item) => item.id == id).toList();
    if (objetivo.isEmpty) return;

    await _escribir(pendientes.where((item) => item.id != id).toList());

    final rutaFoto = objetivo.first.borrador.foto?.ruta;
    if (rutaFoto != null) {
      try {
        await File(rutaFoto).delete();
      } on FileSystemException {
        return;
      }
    }
  });

  Future<void> _escribir(List<ReportePendiente> pendientes) async {
    await (await _almacen).setString(
      _clave,
      jsonEncode(pendientes.map((item) => item.toJson()).toList()),
    );
  }
}
