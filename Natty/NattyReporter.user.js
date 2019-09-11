// ==UserScript==
// @name         Natty Reporter
// @namespace    https://github.com/Tunaki/stackoverflow-userscripts
// @version      0.32
// @description  Adds a Natty link below answers that sends a report for the bot in SOBotics. Intended to be used to give feedback on reports (true positive / false positive / needs edit) or report NAA/VLQ-flaggable answers.
// @author       Tunaki
// @include      /^https?:\/\/(www\.)?stackoverflow\.com\/.*/
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @require      https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js
// @downloadURL  https://github.com/SOBotics/Userscripts/blob/master/Natty/NattyReporter.user.js
// ==/UserScript==

const room = 111347;

if (typeof GM !== 'object') {
  GM = {};
}
if (typeof GM_xmlhttpRequest === 'function') {
  GM.xmlHttpRequest = GM_xmlhttpRequest;
}

function sendChatMessage(msg, answerId) {
  GM.xmlHttpRequest({
    method: 'GET',
    url: 'https://chat.stackoverflow.com/rooms/' + room,
    onload: function (response) {
      var fkey = response.responseText.match(/hidden" value="([\dabcdef]{32})/)[1];
      GM.xmlHttpRequest({
        method: 'POST',
        url: 'https://chat.stackoverflow.com/chats/' + room + '/messages/new',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: 'text=' + encodeURIComponent(msg) + '&fkey=' + fkey,
        onload: function (r) {
          $('[data-answerid="' + answerId + '"] a.report-natty-link').addClass('natty-reported').html('Reported to Natty!');
        }
      });
    }
  });
}

function sendSentinelAndChat(answerId, feedback) {
  var link = 'https://stackoverflow.com/a/' + answerId;
  GM.xmlHttpRequest({
    method: 'GET',
    url: 'http://logs.sobotics.org/napi/api/feedback/' + answerId,
    onload: function (samserverResponse) {
      if (samserverResponse.status !== 200) {
        alert('Error while reporting: status ' + samserverResponse.status);
        return;
      }
      var samserverJson = JSON.parse(samserverResponse.responseText);
      if (samserverJson.items[0] != null) {
        sendChatMessage('@Natty feedback ' + link + ' ' + feedback, answerId);
      } else if (feedback === 'tp') {
        sendChatMessage('@Natty report ' + link, answerId);
      }
    },
    onerror: function (samserverResponse) {
      alert('Error while reporting: ' + samserverResponse.responseText);
    }
  });
}

function sendRequest(event) {
  var messageJSON;
  try {
    messageJSON = JSON.parse(event.data);
  } catch (zError) { }
  if (!messageJSON) return;
  if (messageJSON[0] == 'postHrefReportNatty') {
    $.get(
      '//api.stackexchange.com/2.2/posts/' + messageJSON[1],
      {
        'site': 'stackoverflow',
        'key': 'qhq7Mdy8)4lSXLCjrzQFaQ((',
        'filter': '!3tz1WbZYQxC_IUm7Z',
      }, aRes => {
        // post is deleted, just report it (it can only be an answer since VLQ-flaggable question are only from review, thus not deleted), otherwise, check that it is really an answer and then its date
        if (aRes.items.length === 0) {
          sendSentinelAndChat(messageJSON[1], messageJSON[2]);
        } else if (aRes.items[0].post_type === 'answer') {
          var answerDate = aRes.items[0].creation_date;
          var currentDate = Date.now() / 1000;
          // only do something when answer was less than 30 days ago, after which Natty reports age away
          if (Math.round((currentDate - answerDate) / (24 * 60 * 60)) <= 30) {
            $.get(
              '//api.stackexchange.com/2.2/answers/' + messageJSON[1] + '/questions',
              {
                'site': 'stackoverflow',
                'key': 'qhq7Mdy8)4lSXLCjrzQFaQ((',
                'filter': '!)8aBxR_Gih*BsCr',
              }, qRes => {
                var questionDate = qRes.items[0].creation_date;
                // only do something when answer was posted at least 30 days after the question
                if (Math.round((answerDate - questionDate) / (24 * 60 * 60)) >= 30) {
                  sendSentinelAndChat(messageJSON[1], messageJSON[2]);
                } else {
                  $('[data-answerid="' + messageJSON[1] + '"] a.report-natty-link').addClass('natty-reported').html('Not a late answer.');
                }
              }
            );
          } else {
            $('[data-answerid="' + messageJSON[1] + '"] a.report-natty-link').addClass('natty-reported').html('Answer too old.');
          }
        }
      }
    );
  }
};

window.addEventListener('message', sendRequest, false);

const ScriptToInject = function() {
  function addXHRListener(callback) {
    let open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      this.addEventListener('load', callback.bind(null, this), false);
      open.apply(this, arguments);
    };
  };

  function reportToNatty(e) {
    e.preventDefault();
    var $this = $(this);
    if ($this.closest('a.natty-reported').length > 0) return false;
    var postId = $this.closest('div.post-menu').find('a.js-share-link').attr('href').split('/')[2];
    var feedback = $this.text();
    window.postMessage(JSON.stringify(['postHrefReportNatty', postId, feedback]), "*");
  }

  function shortcutClicked(e) {

    var comments = {
      'link-only':
      'a link to a solution is welcome, but please ensure your answer is useful without it: ' +
      '[add context around the link](//meta.stackexchange.com/a/8259) so your fellow users will ' +
      'have some idea what it is and why it’s there, then quote the most relevant part of the ' +
      'page you\'re linking to in case the target page is unavailable. ' +
      '[Answers that are little more than a link may be deleted.](/help/deleted-answers)',
      'naa <50':
      'this does not provide an answer to the question. You can [search for similar questions](//stackoverflow.com/search), ' +
      'or refer to the related and linked questions on the right-hand side of the page to find an answer. ' +
      'If you have a related but different question, [ask a new question](/questions/ask), ' +
      'and include a link to this one to help provide context. ' +
      'See: [Ask questions, get answers, no distractions](/tour)',
      'naa >50':
      'this post doesn\'t look like an attempt to answer this question. Every post here is expected to be ' +
      'an explicit attempt to *answer* this question; if you have a critique or need a clarification of ' +
      'the question or another answer, you can [post a comment](/help/privileges/comment) ' +
      '(like this one) directly below it. Please remove this answer and create either a comment or a new question. ' +
      'See: [Ask questions, get answers, no distractions](/tour)',
      'thanks <15':
      'please don\'t add _"thanks"_ as answers. They don\'t actually provide an answer to the question, ' +
      'and can be perceived as noise by its future visitors. Once you [earn](//meta.stackoverflow.com/q/146472) ' +
      'enough [reputation](/help/whats-reputation), you will gain privileges to ' +
      '[upvote answers](/help/privileges/vote-up) you like. This way future visitors of the question ' +
      'will see a higher vote count on that answer, and the answerer will also be rewarded with reputation points. ' +
      'See [Why is voting important](/help/why-vote).',
      'thanks >15':
      'please don\'t add _"thanks"_ as answers. They don\'t actually provide an answer to the question, ' +
      'and can be perceived as noise by its future visitors. ' +
      'Instead, [upvote answers](/help/privileges/vote-up) you like. This way future visitors of the question ' +
      'will see a higher vote count on that answer, and the answerer will also be rewarded with reputation points. ' +
      'See [Why is voting important](/help/why-vote).',
      'me too':
      'please don\'t add *"Me too"* as answers. It doesn\'t actually provide an answer to the question. ' +
      'If you have a different but related question, then [ask](/questions/ask) it ' +
      '(reference this one if it will help provide context). If you\'re interested in this specific question, ' +
      'you can [upvote](/help/privileges/vote-up) it, leave a [comment](/help/privileges/comment), ' +
      'or start a [bounty](/help/privileges/set-bounties) ' +
      'once you have enough [reputation](/help/whats-reputation).',
      'lib':
      'please don\'t just post some tool or library as an answer. At least demonstrate [how it solves the problem](//meta.stackoverflow.com/a/251605) in the answer itself.'
    };

    e.preventDefault();
    var postID = $(this).closest('div.post-menu').find('a.js-share-link').attr('href').split('/')[2];
    var whichFeedback = $(this).text();

    //flag the post (and report to Natty)
    if (whichFeedback == 'link-only' || whichFeedback == 'lib') {
      $.post(
        '//stackoverflow.com/flags/posts/' + postID + '/add/PostLowQuality',
        {
          'fkey': StackExchange.options.user.fkey,
          'otherText': ''
        }, response => {
          if (!response.Success) {
            alert('Post could not be flagged VLQ');
          }
        }
      );
    } else {
      $.post(
        '//stackoverflow.com/flags/posts/' + postID + '/add/AnswerNotAnAnswer',
        {
          'fkey': StackExchange.options.user.fkey,
          'otherText': ''
        }
      );
    }

    //add a comment
    $.get(
      '//api.stackexchange.com/2.2/answers/' + postID,
      {
        'site': 'stackoverflow',
        'key': 'qhq7Mdy8)4lSXLCjrzQFaQ((',
      }, aRes => {
        if (aRes.items.length === 0) {
          // Post deleted, nothing to do
          return;
        }
        if (aRes.items[0].user_type == 'does_not_exist') {
          // User deleted, no comment needed
          return;
        }
        if (whichFeedback == 'naa') {
          // Pick the correct comment to post
          if (aRes.items[0].owner.reputation < 50) {
            whichFeedback = 'naa <50';
          } else {
            whichFeedback = 'naa >50';
          }
        }
        if (whichFeedback == 'thanks') {
          if (aRes.items[0].owner.reputation < 15) {
            whichFeedback = 'thanks <15';
          } else {
            whichFeedback = 'thanks >15';
          }
        }
        var comment = aRes.items[0].owner.display_name + ', ' + comments[whichFeedback];
        $.post(
          '//stackoverflow.com/posts/' + postID + '/comments',
          {
            'fkey': StackExchange.options.user.fkey,
            'comment': comment
          }, (data, textStatus, jqXHR) => {
            var commentUI = StackExchange.comments.uiForPost($('#comments-' + postID));
            commentUI.addShow(true, false);
            commentUI.showComments(data, null, false, true);
            $(document).trigger('comment', postID);
          });
      });
  }

  function handleAnswers(postId) {
    var $posts;
    if(!postId) {
      $posts = $('.answer .post-menu');
    } else {
      $posts = $('[data-answerid="' + postId + '"] .post-menu');
    }
    $posts.each(function() {
      var $this = $(this);
      $this.append($('<span>').attr('class', 'lsep').html('|'));
      var $dropdown = $('<dl>').css({ 'margin': '0', 'z-index': '1', 'position': 'absolute', 'white-space': 'nowrap', 'background': '#FFF', 'padding': '2px', 'border': '1px solid #9fa6ad', 'box-shadow': '0 2px 4px rgba(36,39,41,0.3)', 'cursor': 'default' }).hide();
      $.each(['tp', 'fp', 'ne'], function(i, val) { $dropdown.append($('<dd>').append($('<a>').css({ 'display': 'block', 'margin-top': '3px', 'width': 'auto' }).click(reportToNatty).text(val))); });
      $dropdown.append($('<hr>').css({'margin-bottom': '6.5px'}));
      $.each(['link-only', 'naa', 'lib', 'thanks', 'me too'], function(i, val) { $dropdown.append($('<dd>').append($('<a>').css({ 'display': 'block', 'margin-top': '3px', 'width': 'auto' }).click(shortcutClicked).text(val))); });
      $this.append($('<a>').attr('class', 'report-natty-link').html('Natty').hover(function() { $dropdown.toggle(); }).append($dropdown));
    });
  };

  addXHRListener(xhr => {
    if (/ajax-load-realtime/.test(xhr.responseURL)) {
      let matches = /answer" data-answerid="(\d+)/.exec(xhr.responseText);
      if (matches !== null) {
        handleAnswers(matches[1]);
      }
    }
  });

  //Flags
  addXHRListener(xhr => {
    let matches = /flags\/posts\/(\d+)\/add\/(AnswerNotAnAnswer|PostLowQuality)/.exec(xhr.responseURL);
    if (matches !== null && xhr.status === 200) {
      window.postMessage(JSON.stringify(['postHrefReportNatty', matches[1], 'tp']), "*");
    }
  });

  //LQPRQ
  addXHRListener(xhr => {
    let matches = /(\d+)\/recommend-delete/.exec(xhr.responseURL);
    if (matches !== null && xhr.status === 200) {
      window.postMessage(JSON.stringify(['postHrefReportNatty', matches[1], 'tp']), "*");
    }
  });

  //function throttle(fn,countMax,time){let counter=0;setInterval(()=>{counter=0;},time);return function(){if(counter<countMax){counter++;fn.apply(this,arguments);}};}
  //function observe(targets,elements,callback){if(!targets||(Array.isArray(targets)&&!targets.length))return;const observer=new MutationObserver(throttle(mutations=>{for(let i=0;i<mutations.length;i++) {const mutation=mutations[i];const target=mutation.target;const addedNodes=mutation.addedNodes;if(addedNodes){for(let n=0;n<addedNodes.length;n++){if($(addedNodes[n]).find(elements).length){callback(target);return;}}}if($(target).is(elements)){callback(target);return;}}},1500));if(Array.isArray(targets)){for(let i=0;i<targets.length;i++){const target=targets[i];if(!target)continue;observer.observe(target,{attributes:true,childList:true,characterData:true,subtree:true});}}else{observer.observe(targets,{attributes:true,childList:true,characterData:true,subtree:true});}}
  $(document).ready(function() {
    handleAnswers();
  });
  /*observe([...document.getElementsByClassName('post-layout')], '.answer', target => {
    handleAnswers();
  });*/
};

const ScriptToInjectNode = document.createElement('script');
document.body.appendChild(ScriptToInjectNode);

const ScriptToInjectContent = document.createTextNode('(' + ScriptToInject.toString() + ')()');
ScriptToInjectNode.appendChild(ScriptToInjectContent);
