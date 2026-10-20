package com.vibeflix.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import kotlinx.coroutines.launch

/**
 * Diálogo para configurar la IP o URL del servidor Vibe Flix.
 *
 * Adaptado para navegación con control remoto de TV (D-pad):
 * incluye accesos directos para prefijos comunes de red local (192.168.x.x),
 * puerto 8181, teclado numérico en pantalla y comprobación en vivo.
 */
@Composable
fun ServerConfigDialog(
    currentUrl: String,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit,
    onTestConnection: suspend (String) -> Result<String>,
) {
    var urlText by remember { mutableStateOf(currentUrl) }
    var testing by remember { mutableStateOf(false) }
    var testResult by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    val scope = rememberCoroutineScope()

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF0F1523))
                .padding(24.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    text = "⚙ Configurar Servidor Vibe Flix",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color(0xFF35D6C4),
                )
                Text(
                    text = "Introduce la dirección IP de tu PC o la URL del servidor Master-HLS " +
                        "(por ejemplo: http://192.168.1.50:8181 o una URL pública).",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFFCCD2E3),
                )

                OutlinedTextField(
                    value = urlText,
                    onValueChange = {
                        urlText = it
                        testResult = null
                    },
                    label = { Text("URL o IP del servidor") },
                    placeholder = { Text("http://192.168.1.X:8181") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                Text(
                    text = "Accesos rápidos:",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color(0xFF98A2B8),
                )

                // Fila de accesos rapidos comunes para TVs
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val presets = listOf(
                        "http://192.168.1." to "http://192.168.1.",
                        "http://192.168.0." to "http://192.168.0.",
                        ":8181" to ":8181",
                        "http://" to "http://",
                        "https://" to "https://",
                    )
                    presets.forEach { (label, value) ->
                        Button(
                            onClick = {
                                urlText = if (value.startsWith("http")) value else urlText + value
                                testResult = null
                            },
                            colors = ButtonDefaults.colors(containerColor = Color(0xFF1E283C)),
                        ) {
                            Text(label)
                        }
                    }
                    Button(
                        onClick = {
                            if (urlText.isNotEmpty()) urlText = urlText.dropLast(1)
                            testResult = null
                        },
                        colors = ButtonDefaults.colors(containerColor = Color(0xFF2A1C24)),
                    ) {
                        Text("⌫ Borrar")
                    }
                    Button(
                        onClick = {
                            urlText = ""
                            testResult = null
                        },
                        colors = ButtonDefaults.colors(containerColor = Color(0xFF2A1C24)),
                    ) {
                        Text("Limpiar")
                    }
                }

                // Teclado numérico y símbolos para mando a distancia
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0").forEach { digit ->
                        Button(
                            onClick = {
                                urlText += digit
                                testResult = null
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.colors(containerColor = Color(0xFF192233)),
                        ) {
                            Text(digit, textAlign = TextAlign.Center)
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(".", ":", "/", "-", "10.0.2.2:8181").forEach { sym ->
                        Button(
                            onClick = {
                                urlText = if (sym == "10.0.2.2:8181") "http://10.0.2.2:8181" else urlText + sym
                                testResult = null
                            },
                            modifier = Modifier.weight(if (sym.length > 2) 2.5f else 1f),
                            colors = ButtonDefaults.colors(containerColor = Color(0xFF192233)),
                        ) {
                            Text(sym, textAlign = TextAlign.Center)
                        }
                    }
                }

                testResult?.let { (success, message) ->
                    Text(
                        text = (if (success) "✓ " else "✗ ") + message,
                        color = if (success) Color(0xFF4EE388) else Color(0xFFFF6B7D),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                if (testing) {
                    Text(
                        text = "Probando conexión con el servidor…",
                        color = Color(0xFF35D6C4),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Button(
                        onClick = {
                            if (urlText.isNotBlank()) {
                                scope.launch {
                                    testing = true
                                    testResult = null
                                    val res = onTestConnection(urlText)
                                    testing = false
                                    if (res.isSuccess) {
                                        testResult = true to (res.getOrNull() ?: "Conectado")
                                    } else {
                                        val err = res.exceptionOrNull()?.localizedMessage ?: "Fallo de conexión"
                                        testResult = false to err
                                    }
                                }
                            }
                        },
                        enabled = !testing && urlText.isNotBlank(),
                        colors = ButtonDefaults.colors(containerColor = Color(0xFF1E283C)),
                    ) {
                        Text("Probar conexión")
                    }

                    Button(
                        onClick = {
                            if (urlText.isNotBlank()) {
                                onSave(urlText)
                            }
                        },
                        enabled = !testing && urlText.isNotBlank(),
                    ) {
                        Text("Guardar y Conectar")
                    }

                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.colors(containerColor = Color(0xFF283144)),
                    ) {
                        Text("Cancelar")
                    }
                }
            }
        }
    }
}
