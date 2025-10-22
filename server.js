// lib/services/auth_api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AuthApiService {
  static const String loginUrl = 'http://13.48.212.255:6060/api/auth/login';
  static const String _cookieKey = 'auth_cookies';
  static const String _tokenKey  = 'auth_token';

  /// Login with username & password.
  /// Saves cookies (and token if the API also returns one).
  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) async {
    final uri = Uri.parse(loginUrl);
    final res = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'username_up': username,
        'Password_up': password,
      }),
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      String msg = 'Login failed (${res.statusCode})';
      try {
        final body = jsonDecode(res.body);
        if (body is Map && body['message'] != null) msg = body['message'].toString();
      } catch (_) {}
      throw Exception(msg);
    }

    // ---- Parse body as JSON (for optional token etc.) ----
    final data = (jsonDecode(res.body) as Map).cast<String, dynamic>();

    // Optional bearer token (keep your old behavior)
    final token = (data['token'] ?? data['access_token'] ?? data['accessToken'])?.toString();

    // ---- Capture cookies from Set-Cookie header(s) ----
    // package:http exposes a single, merged string at 'set-cookie'
    final setCookieHeader = res.headers['set-cookie']; // may be null
    final cookieHeader = _cookieHeaderFromSetCookie(setCookieHeader);

    final prefs = await SharedPreferences.getInstance();
    if (token != null) await prefs.setString(_tokenKey, token);
    if (cookieHeader != null) await prefs.setString(_cookieKey, cookieHeader);

    return data;
  }

  /// Build a Cookie header (e.g. "sid=...; Path=/; HttpOnly" -> "sid=...")
  /// Supports multiple cookies in one string.
  String? _cookieHeaderFromSetCookie(String? setCookie) {
    if (setCookie == null || setCookie.isEmpty) return null;

    // Extract every "name=value;" pair without attributes
    final reg = RegExp(r'(?:(^|,)\s*)([^=;,]+)=([^;,\r\n]+)');
    final matches = reg.allMatches(setCookie);

    final Map<String, String> pairs = {};
    for (final m in matches) {
      final name = m.group(2)?.trim();
      final value = m.group(3)?.trim();
      if (name != null && value != null && name.isNotEmpty) {
        pairs[name] = value; // last one wins
      }
    }
    if (pairs.isEmpty) return null;

    // Compose Cookie header: "name=value; name2=value2"
    return pairs.entries.map((e) => '${e.key}=${e.value}').join('; ');
  }

  Future<String?> getSavedToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<String?> getSavedCookies() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_cookieKey);
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_cookieKey);
  }
}
