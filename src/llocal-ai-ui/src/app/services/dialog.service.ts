import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {PopupComponent} from '../app/components/common/popup/popup.component'

@Injectable()

export class DialogService {

  constructor(private dialog: MatDialog) {}

  open(data: any) {

    return this.dialog.open(PopupComponent, {

      data: data

    });

  }

}