import { useState } from 'react';
import Messages from '../../shared/Messages/Messages';
import QueryForm from '../../shared/QueryForm/QueryForm';
import '../../../index.css';
import TextInputForm from '../../shared/TextInputForm/TextInputForm';

const BasicChat = () => {

    const [messages, setMessages] = useState<any[]>([]);
    const [isWebsiteLoaded, setIsWebsiteLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const runQuery = async (userQuery: string) => {
        console.log("User query: ", userQuery);
        const response = await window.llocalAiApi.runQuery(userQuery);
        console.log("Response: ", response);
        setMessages(response);
        return response;
    };

    const crawlUrl = async (url: string) => {
        console.log("Url: ", url);
        const response = await window.llocalAiApi.webCrawlerTool(url);
        console.log(response)
        setIsWebsiteLoaded(true);
        console.log("Crawled URL: ", url);
    };

    return (
        <div className='chat-layout'>
            {!isWebsiteLoaded ? (
                <>
                    <div className="empty-state">
                        <h1>Enter a URL to get started!</h1>
                    </div>
                    <div>
                        <TextInputForm onSubmit={(url: string) => crawlUrl(url)} />
                    </div>
                </>
            ) : (
                <>
                    <div>
                        <Messages messages={messages} />
                    </div>
                    <div>
                        <QueryForm onSubmit={(text: string) => runQuery(text)} />
                    </div>
                </>
            )}
        </div>
    );
};

export default BasicChat;
