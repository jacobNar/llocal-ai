import {Component, OnInit, OnDestroy} from "@angular/core"
import { FormBuilder, FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule } from "@angular/forms"
import {Router} from "@angular/router"
import { ApiService } from "./services/api.service";
import { FileService } from "./services/file.service";
import { trigger, state, style, transition, animate } from '@angular/animations';
import {MatSnackBar, MatSnackBarRef} from '@angular/material/snack-bar';
// import * as netlifyIdentity from 'netlify-identity-widget';
import { Subscription, pipe } from "rxjs";
import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";
import type { Document } from '@langchain/core/documents';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    trigger('shake', [
      state('valid', style({ transform: 'translateX(0)' })),
      state('invalid', style({ transform: 'translateX(-20px)' })),
      transition('valid => invalid', animate('150ms linear')),
      transition('invalid => valid', animate('150ms linear'))
    ])
  ]
})
export class AppComponent {
  amount = 15;
  modelForm: FormGroup;
  chatInput: FormGroup;
  fileForm: FormGroup;

  llm: ChatOllama;
  embeddings: OllamaEmbeddings;
  vectorStore: MemoryVectorStore;
  textSplitter = new RecursiveCharacterTextSplitter()
  docSubmitted = false;
  processingDocument = false;
  firstQuestionAsked = false;
  awaitingAnswer = false;

  queryError = false;
  docError = false;

  similarities = [
      {text: "", similarity: 0  }
  ]

  messages:any [] = []

  aiMessages: any[] = [
    [
        "system",
        `You are a helpful assistant that answers questions based on the context and query provided.
        If the knowledge is not in the context, 
        simnply answer that there is not enough information has been supplied to answer the question`,
    ]
]

  documentEmbeddings = []
  documentText = []

  documentsLoading = true;

  customerDocuments: any;
  $customerDocuments: Subscription;

  constructor(private fb: FormBuilder,  private api: ApiService, private fileService: FileService, private _snackBar: MatSnackBar, private router: Router){
      this.modelForm = this.fb.group({
          data: new FormControl("", Validators.required),
      });

      this.chatInput = this.fb.group({
          query: new FormControl({value: null, disabled: true}, [Validators.required])
      });

      this.fileForm = this.fb.group({
          file: new FormControl("",)
      })

      this.$customerDocuments = this.api.$customerDocuments.subscribe((data: any) => this.updateDocuments(data))

      this.llm = new ChatOllama({
          baseUrl: "http://localhost:11434/",
          model: "llama3.2",
          temperature: 0,
          maxRetries: 2,
        });

      this.embeddings = new OllamaEmbeddings({
          baseUrl: "http://localhost:11434/",
          model: "llama3.2"
      })

      this.vectorStore = new MemoryVectorStore(this.embeddings);

      this.textSplitter.chunkSize = 200;
      this.textSplitter.chunkOverlap = 0;
  }

  updateDocuments(data: any){
      console.log(data)
      this.customerDocuments = data
      this.documentsLoading = false;
  }

  async onSubmit(file: File) {
      // event.preventDefault();
      this.processingDocument = true
      var postData = {
          text: this.modelForm.controls['data'].value,
          filename: file.name
      }
      try {
        var sentences = await this.textSplitter.splitText(postData.text);
        const documents: Document[] = sentences.map(sentence => ({
            pageContent: sentence,
            metadata: {}
        }));
        await this.vectorStore.addDocuments(documents)
        debugger
        this.chatInput.controls['query'].enable();
        this.documentText = postData.text;
        this.processingDocument = false;

      }catch (error){
        console.log(error);
        this.docError = true;
        this.processingDocument = false;
        this.docSubmitted = false;
        this._snackBar.open('Please was a problem uploading your file, please try again or use a different file.', 'X', {
            duration: 3000
        });
      }
      console.log(this.modelForm.controls['data']);
  }

  async onQuery(event: Event){
      event.preventDefault();
      
      if(!this.firstQuestionAsked) { this.firstQuestionAsked = true}
      var query = this.chatInput.controls['query'].value
      this.awaitingAnswer = true;

      try {
        //var queryEmbedding = this.embeddings.embedQuery(query);
        var bestmatches = await this.vectorStore.similaritySearch(query, 10)
        const context = bestmatches.map(doc => doc.pageContent).join("\n");

        var prompt = ["human", "Context:" + context + "\n\n Query:\n" + query]

        this.aiMessages.push(prompt);
        console.log(this.aiMessages);
        const aiMsg = await this.llm.invoke(this.aiMessages);

        console.log(aiMsg);
        this.queryError = false;
        this.awaitingAnswer = false;
        this.messages.push({
            question: query,
            answer: aiMsg.content
        })
        
        
      }catch(error){
        this.queryError = true;
        this.awaitingAnswer = false;
        console.log(error);
        this._snackBar.open('There was a problem generating your response, please try again.', 'X', {
            duration: 3000
            });
      }
  }

  async dropHandler(event: any){
      this.docSubmitted = true;
      this.processingDocument = true;
      event.preventDefault();

      var files = event.dataTransfer.files; 

      if( !this.validateFile(files[0])) {
          console.log("not a valid file type")
          this.docSubmitted = false;
          this.processingDocument = false;
          this.docError = true;
          this._snackBar.open('Please upload either a Microsoft Word file or a text file.', 'X', {
              duration: 3000
            });
      }else {
          var fileText = await this.fileService.getText(files[0])
          console.log(fileText)
          this.modelForm.controls['data'].patchValue(fileText)
          
          await this.onSubmit(files[0])
      }
      
  }

  dragOverHandler(event: Event){

      event.preventDefault();
      // console.log(event)
  }

  clickHandler(){
      document.getElementById("file-input")?.click();
  }

  async changeHandler(event: any){
      this.docSubmitted = true;
      this.processingDocument = true;

      event.preventDefault();
      var files = event.target.files;

      if( !this.validateFile(files[0])) {
          this.docSubmitted = false;
          this.processingDocument = false;
          this._snackBar.open('Please upload either a Microsoft Word file or a text file.', 'X', {
              duration: 3000
            });this.docError = true;

      }else {
          var fileText = await this.fileService.getText(files[0])
          console.log(fileText)
          this.modelForm.controls['data'].patchValue(fileText)
          
          await this.onSubmit(event)
      }
  }

  private validateFile(file: File){
      var isValidFileType = false
      var fileType = file.name.substring(file.name.lastIndexOf(".") + 1)
      switch(fileType){
          case "doc":
          case "docx":
          case "txt":
              isValidFileType = true;
              break;
          default:
              isValidFileType = false;
              break;
      }
      return isValidFileType;
  }

  getFieldState(field: string): string {
      return this.docError ? 'invalid' : 'valid';
  }

  signOut(){
      // netlifyIdentity.logout();
      this.router.navigate(['/login'])
  }

  createCustomerPortalSession(){

  }

  loadDocument(index: number){
      this.docSubmitted = true;
      this.processingDocument = true;
      var document = this.customerDocuments.slice(index, index + 1)[0]
      // console.log(document)
      this.documentEmbeddings = JSON.parse(document.embedding);
      this.documentText = JSON.parse(document.text);
      // this.docSubmitted = false;
      this.processingDocument = false;
      this.chatInput.controls['query'].enable();
  }

  resetDashboard(){
      this.docSubmitted = false;
      this.documentEmbeddings = [];
      this.documentText = [];
  }

  ngOnInit(): void {
      this.api.getDocuments()
  }

  ngOnDestroy(): void {
      this.$customerDocuments.unsubscribe();
  }
}

class Similarity {
  "text": string
  "name": number

}
