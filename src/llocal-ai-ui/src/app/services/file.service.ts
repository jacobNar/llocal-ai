import { Injectable } from '@angular/core';
import JSZip from 'jszip';

Injectable()
export class FileService {

  getFileExtension(filename: string): string {
    if (filename.length == 0) return '';
    let dot = filename.lastIndexOf('.');
    if (dot == -1) return '';
    const extension = filename.substr(dot, filename.length);
    return extension;
  }

  readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async getText(file: File): Promise<string> {
    let fileContent = '';
    var fileName = file.name;
    var fileExtension = fileName.substring(fileName.lastIndexOf("."), fileName.length - 1)
    const fileReader = new FileReader();
    console.log(fileExtension)
    
    // start reading the file data
    switch (fileExtension) {
      case '.docx':
      case '.doc':
        
        var fileBuffer = await this.readFileAsArrayBuffer(file)
        const docxData = await JSZip.loadAsync(new Uint8Array(fileBuffer));

        // Extract the content from the `word/document.xml` file
        const documentXmlData = await docxData.file('word/document.xml')?.async('string');
        var xmlData = documentXmlData == undefined ? "" : documentXmlData;
        // Parse the XML data using DOMParser
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlData, 'text/xml');

        // Extract the text content from the XML document
        const textNodes = xmlDoc.getElementsByTagName('w:t');
        fileContent = Array.from(textNodes).map((node) => node.textContent).join('');
        break;
      // read excel books
      case '.txt':
      case '.tx':
        fileContent = await this.readFileAsText(file)
        break;
      case '.csv':
        
        // when the FileReader finishes loading, handle the file data
        
        
        // start reading the file data
        fileContent = await this.readFileAsText(file)
        break;
      // default case
      default:
        throw new Error('unknown extension found!');
    }

    return fileContent;
  }

}