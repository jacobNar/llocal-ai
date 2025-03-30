import { HttpClient, HttpHeaders  } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { Subject, Subscription, catchError, map, throwError } from "rxjs";

@Injectable()
export class ApiService {
    
    constructor(public http: HttpClient, private router: Router) { 
    
    }

    handleResponse(response: any) {
        if(response != undefined && response.status == 200) {
            return response.body
        }else {
            throwError(response)
        }
    }

    handleError(error: any) {
        console.log(error)
        return throwError(error)
    }

    getHeaders(){
        var token = sessionStorage.getItem("jwt");
        console.log(token)
        return new HttpHeaders ({
            Authorization: 'Bearer ' + (token != null ? token : "")
        })
    }

    private customerDetails: any = {};
    private _customerDetails = new Subject<any>();
    $customerDetails = this._customerDetails.asObservable();

    getCustomer(email:string): any{
        console.log(email)
        var postData =  {email: email};
        this.post('.netlify/functions/getStripeCustomer', postData).subscribe(
            (response: any)=> {
                this.customerDetails = response;
                this._customerDetails.next(response);
            },
            (error: any)=> {
                console.log(error)
            } 
        )
    }

    getCustomerDetails(){
        return {
            customerDetails: this.customerDetails,
            customerSubscriptions: this.customerSubscriptions
        }
    }

    private customerSubscriptions: any = {};
    private _customerSubscriptions = new Subject<any>();
    $customerSubscriptions = this._customerSubscriptions.asObservable();

    getSubscriptions(cid: string): any {
        var postData = {cid: cid}
        this.post('.netlify/functions/getCustomerSubscriptions', postData).subscribe(
            (response) => {
                this.customerSubscriptions = response;
                this._customerSubscriptions.next(response);
            },
            (error) => {
                console.log(error)
            }
        )
    }

    private customerDocuments: any = {};
    private _customerDocuments = new Subject<any>();
    $customerDocuments = this._customerDocuments.asObservable();
    
    getDocuments(){
        // this.get('.netlify/functions/getDocuments').subscribe(
        //     (response) => {
        //         this.customerDocuments = response;
        //         this._customerDocuments.next(response);
        //     },
        //     (error) => {
        //         console.log(error)
        //     }
        // )

        this.customerDocuments = {};
        this._customerDocuments.next(this.customerDocuments);
    }

    uploadFile(embedding:number[], text: string[], docName: string ) {
        var formData = {
            embedding: embedding,
            text: text,
            docName: docName
        }
        var headers = this.getHeaders()
        
        // Make a POST request with the FormData as the request body
        return this.post('.netlify/functions/insertDocument', formData).subscribe(
            (response) => {
                console.log('File uploaded successfully:', response);
            },
            (error) => {
                console.error('Error uploading file:', error);
            }
        );
    }

    private isLoggedIn: boolean = false;
    private _isLoggedIn = new Subject<boolean>();
    $isLoggedIn = this._isLoggedIn.asObservable();

    isAuthenticated(){
        this.get(".netlify/functions/authenticateUser").subscribe(
            (response) => {
                console.log(response)
            }
        )
    }
    

    post(url: string, data: any) {
        var httpOptions = {
            headers: this.getHeaders()
        }
        return this.http.post(url,data, httpOptions).pipe(catchError(this.handleError))
    }

    get(url: string, token: string = '') {
        
        var httpOptions = {
            headers: this.getHeaders()
        }
        console.log(httpOptions)

        return this.http.get(url, httpOptions).pipe(catchError(this.handleError))
    }
}