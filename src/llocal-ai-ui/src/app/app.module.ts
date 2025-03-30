import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule} from '@angular/common'; 
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule} from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import {MatTabsModule} from "@angular/material/tabs"
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule} from "@angular/material/icon";

import {MatMenuModule} from '@angular/material/menu'
import {MatSnackBarModule} from "@angular/material/snack-bar"
import {MatSidenavModule} from '@angular/material/sidenav';
import {MatDialogModule} from "@angular/material/dialog";
import { FileService } from './services/file.service';
import { ApiService } from './services/api.service';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    CommonModule,
    HttpClientModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatSidenavModule,
    MatDialogModule,
    BrowserAnimationsModule,
    BrowserAnimationsModule,
  ],
  providers: [ ApiService, FileService],
  bootstrap: [AppComponent]
})
export class AppModule { }
