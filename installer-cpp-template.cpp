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

// Embedded data - will be replaced during build
// Resource embedding is preferred (no base64 overhead), but base64 is kept as fallback
#ifdef USE_RESOURCE_EMBEDDING
// Archive is embedded as Windows resource (ID 101)
const size_t embeddedArchiveSize = {{ARCHIVE_SIZE}};
#else
// Fallback: base64 encoded archive
const char* embeddedArchiveBase64 = R"RAW({{ARCHIVE_BASE64}})RAW";
const size_t embeddedArchiveSize = {{ARCHIVE_SIZE}};
#endif
const char* appName = "{{APP_NAME}}";
const char* htaHtml = R"RAW({{HTA_HTML}})RAW";

// Communication file path
std::string getCommFile() {
    char tempPath[MAX_PATH];
    if (GetTempPathA(MAX_PATH, tempPath) == 0) {
        return "C:\\Windows\\Temp\\installer-comm.json";
    }
    std::string commFile = tempPath;
    if (commFile.back() != '\\') {
        commFile += "\\";
    }
    commFile += "installer-comm.json";
    return commFile;
}

// Load archive from Windows resource (preferred method - no base64 overhead)
#ifdef USE_RESOURCE_EMBEDDING
std::vector<unsigned char> loadArchiveFromResource() {
    HRSRC hResource = FindResourceA(NULL, MAKEINTRESOURCEA(101), RT_RCDATA);
    if (!hResource) {
        return {};
    }
    
    HGLOBAL hMemory = LoadResource(NULL, hResource);
    if (!hMemory) {
        return {};
    }
    
    DWORD size = SizeofResource(NULL, hResource);
    if (size == 0) {
        return {};
    }
    
    LPVOID data = LockResource(hMemory);
    if (!data) {
        return {};
    }
    
    std::vector<unsigned char> result(size);
    memcpy(result.data(), data, size);
    
    return result;
}
#endif

// Base64 decoding (fallback method)
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

// Write string to file
bool writeStringToFile(const std::string& filePath, const std::string& content) {
    std::ofstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }
    file.write(content.c_str(), content.size());
    file.close();
    return true;
}

// Read string from file
std::string readStringFromFile(const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file.is_open()) {
        return "";
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    file.close();
    return buffer.str();
}

// Check if file exists
bool fileExists(const std::string& filePath) {
    DWORD dwAttrib = GetFileAttributesA(filePath.c_str());
    return (dwAttrib != INVALID_FILE_ATTRIBUTES && 
            !(dwAttrib & FILE_ATTRIBUTE_DIRECTORY));
}

// Extract ZIP using PowerShell
bool extractZip(const std::string& zipPath, const std::string& destPath) {
    // Escape paths for PowerShell
    std::string psZipPath = zipPath;
    std::string psDestPath = destPath;
    std::replace(psZipPath.begin(), psZipPath.end(), '\\', '/');
    std::replace(psDestPath.begin(), psDestPath.end(), '\\', '/');
    
    // Build PowerShell command
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
    
    bool success = CreateProcessA(
        NULL,
        cmdLine,
        NULL,
        NULL,
        FALSE,
        0,
        NULL,
        NULL,
        &si,
        &pi
    );
    
    delete[] cmdLine;
    
    if (success) {
        WaitForSingleObject(pi.hProcess, 60000); // 60 second timeout
        DWORD exitCode;
        GetExitCodeProcess(pi.hProcess, &exitCode);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        return exitCode == 0;
    }
    
    return false;
}

// Main extraction function
bool extractFiles(const std::string& extractDir) {
    try {
        // Create directory if it doesn't exist
        CreateDirectoryA(extractDir.c_str(), NULL);
        
        // Load archive (from resource or base64)
        std::vector<unsigned char> archiveData;
#ifdef USE_RESOURCE_EMBEDDING
        archiveData = loadArchiveFromResource();
#else
        std::string base64Str(embeddedArchiveBase64);
        archiveData = base64Decode(base64Str);
#endif
        
        if (archiveData.empty()) {
            return false;
        }
        
        // Write temp ZIP file
        char tempPath[MAX_PATH];
        if (GetTempPathA(MAX_PATH, tempPath) == 0) {
            return false;
        }
        
        std::string tempZip = tempPath;
        if (tempZip.back() != '\\') {
            tempZip += "\\";
        }
        tempZip += "extract-";
        tempZip += std::to_string(GetTickCount());
        tempZip += ".zip";
        
        std::ofstream zipFile(tempZip, std::ios::binary);
        if (!zipFile.is_open()) {
            return false;
        }
        zipFile.write(reinterpret_cast<const char*>(archiveData.data()), archiveData.size());
        zipFile.close();
        
        // Extract using PowerShell
        bool success = extractZip(tempZip, extractDir);
        
        // Clean up temp file
        DeleteFileA(tempZip.c_str());
        
        return success;
    } catch (...) {
        return false;
    }
}

// Launch HTA window
void launchHTA() {
    // Write HTA HTML to temp file
    char tempPath[MAX_PATH];
    if (GetTempPathA(MAX_PATH, tempPath) == 0) {
        return;
    }
    
    std::string htaPath = tempPath;
    if (htaPath.back() != '\\') {
        htaPath += "\\";
    }
    htaPath += "installer-gui-";
    htaPath += std::to_string(GetTickCount());
    htaPath += ".hta";
    
    // Add BOM for proper encoding
    std::string htaContent = "\xEF\xBB\xBF";
    htaContent += htaHtml;
    
    if (!writeStringToFile(htaPath, htaContent)) {
        return;
    }
    
    // Launch mshta.exe
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_SHOW;
    
    std::string cmdLine = "mshta.exe \"";
    cmdLine += htaPath;
    cmdLine += "\"";
    
    char* cmd = new char[cmdLine.length() + 1];
    strcpy_s(cmd, cmdLine.length() + 1, cmdLine.c_str());
    
    CreateProcessA(
        NULL,
        cmd,
        NULL,
        NULL,
        FALSE,
        0,
        NULL,
        NULL,
        &si,
        &pi
    );
    
    delete[] cmd;
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
}

// Main polling loop
int main() {
    // Hide console window immediately
    HWND hwnd = GetConsoleWindow();
    if (hwnd != NULL) {
        ShowWindow(hwnd, SW_HIDE);
    }
    
    // Launch HTA UI
    launchHTA();
    
    // Get communication file path
    std::string commFile = getCommFile();
    
    // Ensure comm file doesn't exist initially
    if (fileExists(commFile)) {
        DeleteFileA(commFile.c_str());
    }
    
    // Poll for extraction requests
    int pollCount = 0;
    const int maxPolls = 1200; // 10 minutes (500ms * 1200)
    
    while (pollCount < maxPolls) {
        Sleep(500); // Poll every 500ms
        pollCount++;
        
        if (fileExists(commFile)) {
            std::string content = readStringFromFile(commFile);
            
            if (content.find("EXTRACT|") == 0) {
                // Extract path from command
                size_t pipePos = content.find('|', 8);
                if (pipePos != std::string::npos) {
                    std::string extractPath = content.substr(8, pipePos - 8);
                    
                    // Perform extraction
                    bool success = extractFiles(extractPath);
                    
                    // Write result
                    std::string result = "COMPLETE|" + extractPath + "|";
                    if (success) {
                        result += "SUCCESS";
                    } else {
                        result += "FAIL|Extraction failed";
                    }
                    writeStringToFile(commFile, result);
                }
            } else if (content == "CLOSE") {
                // Clean up and exit
                DeleteFileA(commFile.c_str());
                break;
            }
        }
    }
    
    return 0;
}

