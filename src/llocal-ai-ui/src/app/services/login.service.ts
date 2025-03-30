import { HttpClient, HttpHeaders  } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Subject, Subscription, catchError, map, throwError } from "rxjs";

@Injectable()
export class LoginService {
    
    constructor(public http: HttpClient, private router: Router) { 
    
    }
  
    private loginData: any = {};
    private _loginData = new Subject<any>();
    $loginData = this._loginData.asObservable();

    setLoginData(data: any){
        this.loginData = data;
        this._loginData.next(data);
    }
}