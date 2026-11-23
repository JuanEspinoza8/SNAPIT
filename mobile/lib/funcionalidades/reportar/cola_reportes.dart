import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'borrador_reporte.dart';

final colaReportesProvider = Provider<ColaReportes>((ref) => ColaReportes());

final reportesPendientesProvider =
    AsyncNotifierProvider<ReportesPendientes, List<ReportePendiente>>(
      ReportesPendientes.new,
    );

class ReportePendiente {
  const ReportePendiente({
    required this.id,
    required this.categoriaNombre,
    required this.borrador,
  });

  final String id;
  final String categoriaNombre;
  final BorradorReporte borrador;

  Map<String, dynamic> toJson() => {
    'id': id,
    'categoriaNombre': categoriaNombre,
    'borrador': borrador.toJson(),
  };

  factory ReportePendiente.desdeJson(Map<String, dynamic> json) =>
      ReportePendiente(
        id: json['id'] as String,
        categoriaNombre: json['categoriaNombre'] as String,
        borrador: BorradorReporte.desdeJson(
          json['borrador'] as Map<String, dynamic>,
        ),
      );
}

class ReportesPendientes extends AsyncNotifier<List<ReportePendiente>> {
  @override
  Future<List<ReportePendiente>> build() =>
      ref.read(colaReportesProvider).leer();

  Future<void> actualizar() async {
    state = AsyncData(await ref.read(colaReportesProvider).leer());
  }
}

class ColaReportes {
  ColaReportes([this._prefs]);

  static const _clave = 'reportesPendientes';

  final SharedPreferences? _prefs;

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
      return datos
          .map(
            (item) => ReportePendiente.desdeJson(item as Map<String, dynamic>),
          )
          .toList();
    } on FormatException {
      return const [];
    }
  }

  Future<ReportePendiente> guardar(
    BorradorReporte borrador, {
    required String categoriaNombre,
  }) async {
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
      categoriaNombre: categoriaNombre,
      borrador: borradorEstable,
    );

    await _escribir([...await leer(), pendiente]);
    return pendiente;
  }

  Future<void> quitar(String id) async {
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
  }

  Future<void> _escribir(List<ReportePendiente> pendientes) async {
    await (await _almacen).setString(
      _clave,
      jsonEncode(pendientes.map((item) => item.toJson()).toList()),
    );
  }
}
