import {Component, OnInit, OnDestroy} from "@angular/core"
import { FormBuilder, FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule } from "@angular/forms"
import {Router} from "@angular/router"
import { ApiService } from "./services/api.service";
import { FileService } from "./services/file.service";
import { trigger, state, style, transition, animate } from '@angular/animations';
import {MatSnackBar, MatSnackBarRef} from '@angular/material/snack-bar';
import { Subscription, pipe } from "rxjs";
import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";
import type { Document } from '@langchain/core/documents';
import { DynamicTool, tool } from "@langchain/core/tools";
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
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
  urlForm: FormGroup;

  agent: any;
  llm: ChatOllama;
  embeddings: OllamaEmbeddings;
//   memory: MemorySaver;
  vectorStore: MemoryVectorStore;
  textSplitter = new RecursiveCharacterTextSplitter()
  tools: any[] = [];
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

  aiMessages: any[] = []

  documentEmbeddings = []
  documentText = []

  documentsLoading = true;

  customerDocuments: any;
  $customerDocuments: Subscription;

  webCrawlerTool: any

  constructor(private fb: FormBuilder,  private api: ApiService, private fileService: FileService, private _snackBar: MatSnackBar, private router: Router){
      this.modelForm = this.fb.group({
          data: new FormControl("", Validators.required),
      });

      this.urlForm = this.fb.group({
        url: new FormControl("", Validators.required)
      })

      this.chatInput = this.fb.group({
          query: new FormControl({value: null, disabled: false}, [Validators.required])
      });

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

    //   const agentCheckpointer = new MemorySaver()

      this.textSplitter.chunkSize = 200;
      this.textSplitter.chunkOverlap = 0;

    interface SiteContent {
        [url: string]: string;
    }
    
    this.webCrawlerTool = tool(async ({ startUrl }: { startUrl: string }): Promise<string> => {
        var response: SiteContent = await (window as any).electronAPI.webCrawlerTool(startUrl);
        var urlPages = Object.values(response)
        var urls = Object.keys(response)
        const documents: Document[] = [];
        
        urlPages.map(async (urlPage: string, index: number) =>{
            var sentences = await this.textSplitter.splitText(urlPage);
            let documents = sentences.map(sentence => ({
                pageContent: sentence,
                metadata: {url: urls[index]}
            }));
            await this.vectorStore.addDocuments(documents)
        })
        return "urls vectorized: " + urls.join(", ");
    }, {
        name: "Website Crawler",
        description: "Crawls a website starting from the given URL and adds the whole site's text to a vector store. You can retrieve the sites info by using the tool 'Similarity Search Vectorized Websites'.",
        schema: z.object({
            startUrl: z.string().url().describe("The starting URL to crawl")
        })
    });

    const vectoreStoreTool = tool(async ({ query }: { query: string }): Promise<string> => {
        var results: Document[] = await this.vectorStore.similaritySearch(query, 30)
        var resultsText = results.map(x=> x.pageContent).join("\n\n")
        return resultsText;
    }, {
        name: "Similarity Search Vectorized Websites",
        description: "Grabs context via similarity search from the previously vectorized website.",
        schema: z.object({
            query: z.string().describe("The query to do a similarity search based on")
        })
    });


    this.tools  = [vectoreStoreTool];

    console.log(this.tools)

    this.agent = createReactAgent({
        llm: this.llm,
        tools: this.tools,
    })

  }

  async onUrlSubmit(){
    this.chatInput.controls['query'].disable();
    this.docSubmitted = true;
    this.processingDocument = true;
    try {
        await this.webCrawlerTool.invoke({startUrl: this.urlForm.controls['url'].value})
        this.chatInput.controls['query'].enable();
        this.processingDocument = false;

      }catch (error){
        console.log(error);
        this.docError = true;
        this.processingDocument = false;
        this.docSubmitted = false;
        this._snackBar.open('Please was a problem processing you url, please try again or use a url.', 'X', {
            duration: 3000
        });
      }
  }


  updateDocuments(data: any){
      console.log(data)
      this.customerDocuments = data
      this.documentsLoading = false;
  }

  async onSubmit(file: File) {
      this.chatInput.controls['query'].disable();
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
      this.chatInput.controls['query'].setValue("")

      try {
        let prompt = {role: "user", content: query}
        if(this.docSubmitted){
            prompt.content +=" \nPlease use the 'Similarity Search Vectorized Websites' tool for context."
        }

        this.aiMessages.push(prompt);
        this.messages.push(prompt)

        let previousLength = this.aiMessages.length;

        const aiMsg = await this.agent.invoke({messages: this.aiMessages});
        const messages = aiMsg.messages;

        console.log(previousLength, messages.length)
        console.log(aiMsg)

        for(let i = previousLength; i < messages.length; i++){
            let messageType = this.getMessageType(messages[i])
            this.messages.push({
                role: messageType,
                content: messages[i].content,
                lc_kwargs: messages[i].lc_kwargs
            })

            if(messageType != "tool"){
                this.aiMessages.push({
                    role: messageType,
                    content: messages[i].content,
                })
            }
        }

        this.queryError = false;
        this.awaitingAnswer = false;       
        
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

  getMessageType(msg: any){
    console.log(typeof msg)
    if (msg.tool_call_id != undefined) {
        return "tool"
    }else {
        return "assistant"
    }
  }

  ngOnInit(): void {
      this.api.getDocuments()
  }

  ngOnDestroy(): void {
      this.$customerDocuments.unsubscribe();
  }
}