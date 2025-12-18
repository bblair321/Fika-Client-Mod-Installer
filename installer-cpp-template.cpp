// C++ Extractor Template
// This template will be populated with embedded archive data and HTA HTML
// Compiles to a native Windows executable (~1-2MB vs ~30-35MB Node.js runtime)

#include <windows.h>
#include <string>
#include <fstream>
#include <sstream>
#include <vector>
#include <algorithm>
#include <shlobj.h>
#include <comdef.h>
#include <comutil.h>

#pragma comment(lib, "comsuppw.lib")
#pragma comment(lib, "shell32.lib")

// ---------------------
// Embedded data
// ---------------------
#ifdef USE_RESOURCE_EMBEDDING
// Archive is embedded as Windows resource (ID 101)
const size_t embeddedArchiveSize = {{ARCHIVE_SIZE}}; // numeric literal
#else
// Fallback: base64 encoded archive
const char* embeddedArchiveBase64 = R"RAW({{ARCHIVE_BASE64}})RAW";
const size_t embeddedArchiveSize = {{ARCHIVE_SIZE}}; // numeric literal
#endif

const char* appName = "{{APP_NAME}}"; // string literal

// === BEGIN_HTA_HTML ===
const char* htaHtml = R"__HTA__({{HTA_HTML}})__HTA__";
// === END_HTA_HTML ===

const char* archiveFormat = "{{ARCHIVE_FORMAT}}"; // "zip" or "7z"

// ---------------------
// Communication file path
// ---------------------
std::string getCommFile() {
    char tempPath[MAX_PATH];
    if (GetTempPathA(MAX_PATH, tempPath) == 0) {
        return "C:\\Windows\\Temp\\installer-comm.json";
    }
    std::string commFile = tempPath;
    if (commFile.back() != '\\') commFile += "\\";
    commFile += "installer-comm.json";
    return commFile;
}

// ---------------------
// Resource / base64 loading
// ---------------------
#ifdef USE_RESOURCE_EMBEDDING
std::vector<unsigned char> loadArchiveFromResource() {
    HRSRC hResource = FindResourceA(NULL, MAKEINTRESOURCEA(101), RT_RCDATA);
    if (!hResource) {
        // Resource not found - this means the resource wasn't linked during compilation
        return {};
    }

    HGLOBAL hMemory = LoadResource(NULL, hResource);
    if (!hMemory) {
        // Failed to load resource into memory
        return {};
    }

    DWORD size = SizeofResource(NULL, hResource);
    if (size == 0) {
        // Resource has zero size - resource file may be empty or not properly embedded
        return {};
    }

    LPVOID data = LockResource(hMemory);
    if (!data) {
        // Failed to lock resource data
        return {};
    }

    std::vector<unsigned char> result(size);
    memcpy(result.data(), data, size);
    return result;
}
#endif

#ifndef USE_RESOURCE_EMBEDDING
std::vector<unsigned char> base64Decode(const std::string& encoded) {
    const std::string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::vector<unsigned char> result;
    int val = 0, valb = -8;

    for (unsigned char c : encoded) {
        if (c == '=') break;
        size_t pos = chars.find(c);
        if (pos == std::string::npos) continue;
        val = (val << 6) + pos;
        valb += 6;
        if (valb >= 0) {
            result.push_back((val >> valb) & 0xFF);
            valb -= 8;
        }
    }
    return result;
}
#endif

// ---------------------
// File operations
// ---------------------
bool writeStringToFile(const std::string& filePath, const std::string& content) {
    std::ofstream file(filePath, std::ios::binary);
    if (!file.is_open()) return false;
    file.write(content.c_str(), content.size());
    file.close();
    return true;
}

std::string readStringFromFile(const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file.is_open()) return "";
    std::stringstream buffer;
    buffer << file.rdbuf();
    file.close();
    return buffer.str();
}

bool fileExists(const std::string& filePath) {
    DWORD dwAttrib = GetFileAttributesA(filePath.c_str());
    return (dwAttrib != INVALID_FILE_ATTRIBUTES && !(dwAttrib & FILE_ATTRIBUTE_DIRECTORY));
}

// ---------------------
// Extraction functions (ZIP / 7z)
// ---------------------
bool extractZip(const std::string& zipPath, const std::string& destPath) {
    std::string psZipPath = zipPath;
    std::string psDestPath = destPath;
    std::replace(psZipPath.begin(), psZipPath.end(), '\\', '/');
    std::replace(psDestPath.begin(), psDestPath.end(), '\\', '/');

    std::string psCommand = "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Expand-Archive -Path '";
    psCommand += psZipPath;
    psCommand += "' -DestinationPath '";
    psCommand += psDestPath;
    psCommand += "' -Force\"";

    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    char* cmdLine = new char[psCommand.length() + 1];
    strcpy_s(cmdLine, psCommand.length() + 1, psCommand.c_str());

    bool success = CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
    delete[] cmdLine;

    if (success) {
        // Wait up to 10 minutes for large archives (600000ms = 10 minutes)
        DWORD waitResult = WaitForSingleObject(pi.hProcess, 600000);
        DWORD exitCode;
        if (waitResult == WAIT_TIMEOUT) {
            // Process timed out - terminate it
            TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            return false;
        }
        GetExitCodeProcess(pi.hProcess, &exitCode);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        return exitCode == 0;
    }
    return false;
}

// ---------------------
// Main extraction routine
// ---------------------
std::string extractFiles(const std::string& extractDir) {
    try {
        CreateDirectoryA(extractDir.c_str(), NULL);

        std::vector<unsigned char> archiveData;
#ifdef USE_RESOURCE_EMBEDDING
        archiveData = loadArchiveFromResource();
        if (archiveData.empty()) {
            return "Resource not found or empty. Resource ID 101 may not be embedded. Archive size: 0 bytes.";
        }
        // Verify resource size matches expected size
        if (archiveData.size() != embeddedArchiveSize) {
            return "Resource size mismatch. Expected: " + std::to_string(embeddedArchiveSize) + 
                   " bytes, got: " + std::to_string(archiveData.size()) + " bytes.";
        }
#else
        if (!embeddedArchiveBase64 || strlen(embeddedArchiveBase64) == 0) {
            return "Archive data is empty (base64 string is null or empty).";
        }
        archiveData = base64Decode(embeddedArchiveBase64);
        if (archiveData.empty()) {
            return "Failed to decode base64 archive data.";
        }
#endif

        if (archiveData.empty()) {
            return "Archive data is empty after loading.";
        }

        std::string format(archiveFormat);
        std::string extension = (format == "7z") ? ".7z" : ".zip";

        char tempPath[MAX_PATH];
        if (GetTempPathA(MAX_PATH, tempPath) == 0) {
            return "Failed to get temporary directory path.";
        }

        std::string tempArchive = tempPath;
        if (tempArchive.back() != '\\') tempArchive += "\\";
        tempArchive += "extract-" + std::to_string(GetTickCount()) + extension;

        std::ofstream archiveFile(tempArchive, std::ios::binary);
        if (!archiveFile.is_open()) {
            return "Failed to create temporary archive file: " + tempArchive;
        }
        archiveFile.write(reinterpret_cast<const char*>(archiveData.data()), archiveData.size());
        archiveFile.close();

        bool success = (format == "7z") ? extractZip(tempArchive, extractDir) : extractZip(tempArchive, extractDir);
        DeleteFileA(tempArchive.c_str());
        if (!success) {
            return "PowerShell extraction failed. Check if Expand-Archive is available.";
        }
        return "SUCCESS";
    } catch (const std::exception& e) {
        return std::string("Exception: ") + e.what();
    } catch (...) {
        return "Unknown error during extraction.";
    }
}

// ---------------------
// Launch HTA GUI
// ---------------------
void launchHTA() {
    if (!htaHtml || strlen(htaHtml) == 0) {
        MessageBoxA(NULL, "Error: HTA HTML content is empty.", "Installer Error", MB_OK | MB_ICONERROR);
        return;
    }

    char tempPath[MAX_PATH];
    if (GetTempPathA(MAX_PATH, tempPath) == 0) return;

    std::string htaPath = tempPath;
    if (htaPath.back() != '\\') htaPath += "\\";
    htaPath += "installer-gui-" + std::to_string(GetTickCount()) + ".hta";

    if (!writeStringToFile(htaPath, htaHtml)) return;

    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi = {0};
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_SHOW;

    std::string cmdLine = "mshta.exe \"" + htaPath + "\"";
    char* cmd = new char[cmdLine.length() + 1];
    strcpy_s(cmd, cmdLine.length() + 1, cmdLine.c_str());

    CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
    delete[] cmd;
}

// ---------------------
// Main
// ---------------------
int main() {
    HWND hwnd = GetConsoleWindow();
    if (hwnd) ShowWindow(hwnd, SW_HIDE);

    launchHTA();
    std::string commFile = getCommFile();
    if (fileExists(commFile)) DeleteFileA(commFile.c_str());

    int pollCount = 0;
    const int maxPolls = 1200; // 10 minutes

    while (pollCount < maxPolls) {
        Sleep(500);
        pollCount++;
        if (!fileExists(commFile)) continue;

        std::string content = readStringFromFile(commFile);
        if (content.find("EXTRACT|") == 0) {
            // Extract path - it's everything after "EXTRACT|" (position 8)
            // Remove any trailing whitespace/newlines
            std::string extractPath = content.substr(8);
            // Trim whitespace
            while (!extractPath.empty() && (extractPath.back() == '\r' || extractPath.back() == '\n' || extractPath.back() == ' ' || extractPath.back() == '\t')) {
                extractPath.pop_back();
            }
            
            if (!extractPath.empty()) {
                std::string extractResult = extractFiles(extractPath);
                std::string result;
                if (extractResult == "SUCCESS") {
                    result = "COMPLETE|" + extractPath + "|SUCCESS";
                } else {
                    result = "COMPLETE|" + extractPath + "|FAIL|" + extractResult;
                }
                writeStringToFile(commFile, result);
            }
        } else if (content == "CLOSE") {
            DeleteFileA(commFile.c_str());
            break;
        }
    }

    return 0;
}
